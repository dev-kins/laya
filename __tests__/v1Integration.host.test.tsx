/// <reference types="node" />
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react-native';

import App from '../App';
import { createAddDebtOperation } from '../src/application/addDebt';
import { createAddIncomeOperation } from '../src/application/addIncome';
import { createAddExpenseOperation } from '../src/application/addExpense';
import { emptyDebtForm } from '../src/application/debtForm';
import { emptyIncomeForm } from '../src/application/incomeForm';
import { emptyExpenseForm } from '../src/application/expenseForm';
import { readAvailableMoney, saveAvailableMoney } from '../src/application/availableMoney';
import { listDebts } from '../src/application/listDebts';
import { listIncome } from '../src/application/listIncome';
import { listExpenses } from '../src/application/listExpenses';
import { loadHome } from '../src/application/loadHome';
import { loadTimeline } from '../src/application/loadTimeline';
import { loadPlan } from '../src/application/loadPlan';
import { onboardingService } from '../src/application/onboarding';
import { DebtPayment } from '../src/domain/DebtPayment';
import { FinancialDate } from '../src/domain/FinancialDate';
import { paymentId } from '../src/domain/identifiers';
import { Money } from '../src/domain/Money';
import type { FinancialConnection, SqlValue } from '../src/persistence/sqlite/connection';
import { initializeDatabase } from '../src/persistence/sqlite/initialize';
import { createDebtRepository } from '../src/persistence/sqlite/debtRepository';
import { createIncomeRepository } from '../src/persistence/sqlite/incomeRepository';
import { createEssentialObligationRepository } from '../src/persistence/sqlite/essentialObligationRepository';
import { createDebtPaymentRepository } from '../src/persistence/sqlite/debtPaymentRepository';

// Replace only the platform connection boundary. Services, parsers, repositories,
// migrations, engines, screens and navigation all remain real.
jest.mock('../src/persistence/sqlite/database', () => ({ openLayaDatabase: () => mockOpenDatabase() }));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
const mockOpenDatabase = jest.fn<Promise<FinancialConnection>, []>();
const today = () => FinancialDate.parse('2026-01-29');
let directory: string;
let writes: number;
const owned = new Set<FinancialConnection>();
async function open(): Promise<FinancialConnection> {
  const native = new DatabaseSync(join(directory, 'synthetic.db'));
  const db: FinancialConnection = {
    async execAsync(sql) { native.exec(sql); },
    async getFirstAsync<T>(sql: string, ...params: SqlValue[]) { return (native.prepare(sql).get(...params) as T | undefined) ?? null; },
    async getAllAsync<T>(sql: string, ...params: SqlValue[]) { return native.prepare(sql).all(...params) as T[]; },
    async runAsync(sql, ...params) { const result = native.prepare(sql).run(...params); writes++; return result; },
    async closeAsync() { native.close(); owned.delete(db); },
  };
  owned.add(db);
  try { await initializeDatabase(db); } catch (error) { await db.closeAsync(); throw error; }
  return db;
}
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'laya-v1-integration-'));
  writes = 0;
  mockOpenDatabase.mockReset().mockImplementation(open);
});
afterEach(async () => {
  await cleanup();
  jest.useRealTimers();
  const leaked = owned.size;
  for (const db of owned) await db.closeAsync();
  // Only the uniquely allocated disposable fixture directory is removed.
  rmSync(directory, { recursive: true, force: true });
  expect(leaked).toBe(0);
});

async function seedFinancialRecords() {
  const addDebt = (id: string, fields: Partial<typeof emptyDebtForm>) => createAddDebtOperation({
    open, generateId: () => id, repository: createDebtRepository,
  })({ ...emptyDebtForm, name: `Synthetic debt ${id}`, interestChoice: 'unknown', balance: '0', ...fields });
  const debt = await addDebt('A', { balance: '1500.01', provider: 'Synthetic provider', scheduledPayment: '100.01',
    nextDueDate: '2026-01-30', recurrence: 'monthly', firstDay: '31', interestChoice: 'known', interestRate: '5' });
  await addDebt('B', { balance: '8000.02', interestChoice: 'known', interestRate: '2', interestPeriod: 'monthly' });
  await addDebt('C', { balance: '4000.03', interestChoice: 'known', interestRate: '18' });
  await addDebt('Z', { scheduledPayment: '0', nextDueDate: '2026-01-30' });
  const addIncome = (id: string, fields: Partial<typeof emptyIncomeForm>) => createAddIncomeOperation({
    open, generateId: () => id, repository: createIncomeRepository,
  })({ ...emptyIncomeForm, name: `Synthetic income ${id}`, amount: '0', date: '2026-01-29', status: 'expected', ...fields });
  await addIncome('expected', { amount: '500.03', recurrence: 'twice-monthly', firstDay: '30', secondDay: '31' });
  await addIncome('received', { amount: '9000', date: '2026-01-30', status: 'received' });
  await addIncome('zero', {});
  const addExpense = (id: string, fields: Partial<typeof emptyExpenseForm>) => createAddExpenseOperation({
    open, generateId: () => id, repository: createEssentialObligationRepository,
  })({ ...emptyExpenseForm, name: `Synthetic expense ${id}`, amount: '0', date: '2026-01-29', ...fields });
  await addExpense('recurring', { amount: '200.02', recurrence: 'monthly', firstDay: '31' });
  await addExpense('today', { amount: '9999' });
  await addExpense('zero', {});
  const db = await open();
  try {
    await createDebtPaymentRepository(db).save(DebtPayment.create({ id: paymentId('history'), debtId: debt.id,
      amount: Money.parse('2000', 'PHP'), date: FinancialDate.parse('2026-01-30') }));
  } finally { await db.closeAsync(); }
}

test('persisted form records flow through all loaders, recurrence, replacements and strategy allocations', async () => {
  await seedFinancialRecords();
  expect((await listDebts()).map(d => d.balance.minorUnits)).toEqual([150001, 800002, 400003, 0]);
  expect((await listIncome()).map(i => i.status)).toEqual(['expected', 'received', 'expected']);
  expect(await listExpenses()).toHaveLength(3);
  expect(await readAvailableMoney()).toBeNull();
  expect((await loadHome({ today })).kind).toBe('missing-available-money');
  expect((await loadTimeline({ today })).kind).toBe('missing-available-money');
  const missingPlan = await loadPlan({ today });
  expect(missingPlan.context.kind).toBe('missing-available-money');
  expect(missingPlan.recordedDebtCount).toBe(4);
  expect(missingPlan.totalScheduledDues.minorUnits).toBe(20002);

  // Positive -> different positive -> zero -> positive, always reopening storage.
  for (const [input, capacity, ending] of [
    ['3000.01', 290000, 490010], ['3500.02', 340001, 540011], ['0', 0, 190009], ['20000', 1989999, 2190009],
  ] as const) {
    await saveAvailableMoney(input);
    const beforeReads = writes;
    const timeline = await loadTimeline({ today });
    const home = await loadHome({ today });
    const plan = await loadPlan({ today });
    if (timeline.kind !== 'ready' || home.kind !== 'ready' || plan.context.kind !== 'ready') throw Error('Expected ready');
    expect(timeline.projection.start.date.toString()).toBe('2026-01-29');
    expect(timeline.projection.through.toString()).toBe('2026-03-30');
    expect(home.safeToPay).toEqual(plan.context.safeToPay);
    expect(home.safeToPay.amount.minorUnits).toBe(capacity);
    expect(home.safeToPay.protectionThroughDate).toEqual(timeline.projection.through);
    expect(home.availableMoney).toEqual(timeline.projection.start.balance);
    expect(home.availableMoney).toEqual(plan.context.availableMoney);
    expect(home.nextEvent).toEqual(timeline.groups[0].entries[0]);
    expect(home.nextEvent?.event.kind).toBe('debt-due');
    expect(home.lowestProjected).toEqual(timeline.projection.minimumProjectedBalance);
    expect(home.lowestProjected).toEqual(plan.context.lowestProjected);
    expect(home.endingProjected.minorUnits).toBe(ending);
    expect(home.endingProjected).toEqual(timeline.projection.endingBalance);
    expect(home.endingProjected).toEqual(plan.context.endingProjected);
    expect(plan.totalReportedDebt.minorUnits).toBe(1350006);
    expect(plan.recordedPaymentCount).toBe(1); // History never subtracts reported balance.
    expect(plan.scheduledDueCount).toBe(2);
    const points = timeline.projection.points;
    expect(points.filter(p => p.event.kind === 'debt-due').map(p => p.event.date.toString()))
      .toEqual(['2026-01-30', '2026-02-28']); // Exceptional January date replaces Jan 31.
    expect(points.filter(p => p.event.kind === 'expected-income').map(p => p.event.date.toString()))
      .toEqual(['2026-01-30', '2026-01-31', '2026-02-28', '2026-02-28', '2026-03-30']);
    expect(timeline.groups.find(g => g.date.toString() === '2026-02-28')?.entries.map(e => e.event.kind))
      .toEqual(['essential-due', 'debt-due', 'expected-income', 'expected-income']);
    expect(timeline.projection.excludedEvents.map(e => [e.event.kind, e.reason]))
      .toEqual([['essential-due', 'outside-window'], ['debt-payment', 'actual-event'], ['received-income', 'actual-event']]);
    for (const scenario of Object.values(plan.context.strategies)) {
      expect(scenario.safeToPay).toBe(plan.context.safeToPay);
      const allocation = scenario.allocation;
      expect(allocation.totalAllocated.add(allocation.remainingSafeToPay)).toEqual(home.safeToPay.amount);
      expect(allocation.totalAllocated.compare(home.safeToPay.amount)).toBeLessThanOrEqual(0);
      expect(allocation.protectionThroughDate).toEqual(timeline.projection.through);
      for (const entry of allocation.allocations) {
        expect(entry.amount.minorUnits).toBeGreaterThan(0);
        expect(entry.amount.compare(entry.debt.balance)).toBeLessThanOrEqual(0);
        expect(entry.debt.id).not.toBe('Z');
      }
      if (input === '0') expect(allocation.allocations).toEqual([]);
      if (input === '20000') expect(allocation.remainingSafeToPay.minorUnits).toBe(639993);
    }
    if (input === '3000.01') {
      const scenarios = plan.context.strategies;
      expect(scenarios.snowball.orderedEntries.map(e => e.debt.id)).toEqual(['Z', 'A', 'C', 'B']);
      expect(scenarios.avalanche.orderedEntries.map(e => e.debt.id)).toEqual(['B', 'C', 'A', 'Z']);
      expect(scenarios.adaptive.orderedEntries.map(e => e.debt.id)).toEqual(['A', 'B', 'C', 'Z']);
      expect(scenarios.adaptive.allocation.allocations.map(e => [e.debt.id, e.amount.minorUnits, e.coverage]))
        .toEqual([['A', 150001, 'full'], ['B', 139999, 'partial']]);
    }
    if (input === '0') expect(home.lowestProjected.minorUnits).toBe(-10001);
    expect(writes).toBe(beforeReads);
    expect(owned.size).toBe(0);
  }
  const db = await open();
  try {
    expect(await db.getFirstAsync('SELECT count(*) AS count FROM available_money')).toEqual({ count: 1 });
    expect(await db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 4 });
    expect((await createDebtRepository(db).list()).map(d => d.balance.minorUnits)).toEqual([150001, 800002, 400003, 0]);
    expect(await createDebtPaymentRepository(db).list()).toHaveLength(1);
  } finally { await db.closeAsync(); }
});

test('empty and corrupt storage stay distinct from missing or explicit zero across all loaders', async () => {
  await saveAvailableMoney('0');
  const timeline = await loadTimeline({ today });
  const home = await loadHome({ today });
  const plan = await loadPlan({ today });
  if (timeline.kind !== 'ready' || home.kind !== 'ready' || plan.context.kind !== 'ready') throw Error('Expected ready');
  expect(timeline.groups).toEqual([]);
  expect(home.nextEvent).toBeNull();
  expect(home.safeToPay.amount.minorUnits).toBe(0);
  expect(plan.recordedDebtCount).toBe(0);
  expect(Object.values(plan.context.strategies).every(s => s.allocation.allocations.length === 0)).toBe(true);
  const db = await open();
  try {
    // Corrupt only the disposable fixture to exercise real read guards.
    await db.execAsync("PRAGMA ignore_check_constraints = ON; UPDATE available_money SET currency = 'invalid'");
  } finally { await db.closeAsync(); }
  for (const load of [loadHome, loadTimeline, loadPlan]) {
    await expect(load({ today })).rejects.toThrow();
    expect(owned.size).toBe(0);
  }
});

test('real startup completion, Profile review and relaunch preserve persisted records without review writes', async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 0, 29, 12));
  const app = await render(<App />);
  await fireEvent.press(await screen.findByRole('button', { name: 'Get Started' }));
  expect(await screen.findByRole('tab', { name: 'Home', selected: true })).toBeOnTheScreen();
  expect(await onboardingService.isComplete()).toBe(true);
  await seedFinancialRecords();
  await saveAvailableMoney('3000.01');
  const beforeReview = writes;
  await fireEvent.press(screen.getByRole('tab', { name: 'Profile' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Review how Laya works' }));
  expect(screen.queryByRole('button', { name: 'Get Started' })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Done reviewing' }));
  expect(screen.getByRole('tab', { name: 'Profile', selected: true })).toBeOnTheScreen();
  expect(writes).toBe(beforeReview);
  expect(await onboardingService.isComplete()).toBe(true);
  // Profile's shortcut can push onto an already-used Add stack, not just AddHub.
  await fireEvent.press(screen.getByRole('tab', { name: 'Add' }));
  await fireEvent.press(screen.getByRole('button', { name: 'View my debts' }));
  expect(await screen.findByText('Synthetic debt A')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('tab', { name: 'Profile' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Available Money' }));
  expect(await screen.findByLabelText('Available money (PHP)')).toHaveDisplayValue('3000.01');
  await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
  expect(screen.getByRole('header', { name: 'Mga Utang' })).toBeOnTheScreen();
  await app.unmount();
  await render(<App />);
  expect(await screen.findByLabelText(/Safe-to-Pay\. 2,900.00 Philippine pesos/)).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Get Started' })).toBeNull();
  await fireEvent.press(screen.getByRole('tab', { name: 'Plan' }));
  expect(await screen.findByRole('radio', { name: 'Laya Adaptive', checked: true })).toBeOnTheScreen();
  const opensBeforeSwitch = mockOpenDatabase.mock.calls.length;
  for (const name of ['Snowball', 'Avalanche', 'Laya Adaptive']) {
    await fireEvent.press(screen.getByRole('radio', { name }));
    expect(screen.getByRole('radio', { name, checked: true })).toBeOnTheScreen();
  }
  expect(mockOpenDatabase).toHaveBeenCalledTimes(opensBeforeSwitch);
  expect(writes).toBe(beforeReview);
  expect(await listDebts()).toHaveLength(4);
  expect(await listIncome()).toHaveLength(3);
  expect(await listExpenses()).toHaveLength(3);
  await act(async () => { jest.runOnlyPendingTimers(); });
});
