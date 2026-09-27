/// <reference types="node" />
// Real host SQLite, not verification of the native Expo bridge.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { readAvailableMoney, saveAvailableMoney } from '../../application/availableMoney';
import { AvailableMoney } from '../../domain/AvailableMoney';
import { Debt } from '../../domain/Debt';
import { DebtPayment } from '../../domain/DebtPayment';
import { EssentialObligation } from '../../domain/EssentialObligation';
import { FinancialDate } from '../../domain/FinancialDate';
import { debtId, incomeId, obligationId, paymentId } from '../../domain/identifiers';
import { Income } from '../../domain/Income';
import { Money } from '../../domain/Money';
import { Recurrence } from '../../domain/Recurrence';
import { createAvailableMoneyRepository } from './availableMoneyRepository';
import type { FinancialConnection, SqlValue } from './connection';
import { createDebtPaymentRepository } from './debtPaymentRepository';
import { createDebtRepository } from './debtRepository';
import { createEssentialObligationRepository } from './essentialObligationRepository';
import { createIncomeRepository } from './incomeRepository';
import { initializeDatabase } from './initialize';
import { migrations, runMigrations } from './migrations';
import { createOnboardingRepository } from './onboarding';
import { readProbe, writeProbe } from './probe';

let directory: string;
let db: FinancialConnection;
const owned = new Set<FinancialConnection>();
function open(): FinancialConnection {
  const native = new DatabaseSync(join(directory, 'synthetic.db'));
  const connection: FinancialConnection = {
    async execAsync(sql) { native.exec(sql); },
    async getFirstAsync<T>(sql: string, ...params: SqlValue[]) { return (native.prepare(sql).get(...params) as T | undefined) ?? null; },
    async getAllAsync<T>(sql: string, ...params: SqlValue[]) { return native.prepare(sql).all(...params) as T[]; },
    async runAsync(sql, ...params) { return native.prepare(sql).run(...params); },
    async closeAsync() { native.close(); owned.delete(connection); },
  };
  owned.add(connection);
  return connection;
}
beforeEach(() => { directory = mkdtempSync(join(tmpdir(), 'laya-available-money-')); db = open(); });
afterEach(async () => {
  try { for (const connection of owned) await connection.closeAsync(); }
  finally { rmSync(directory, { recursive: true, force: true }); }
});
const snapshot = (minorUnits: number) => AvailableMoney.create({ amount: Money.fromMinorUnits(minorUnits, 'PHP') });

test.each([false, true])('migration 3 to 4 preserves every prior data kind, rollback/retry: %s', async fail => {
  await initializeDatabase(db, migrations.slice(0, 3));
  const date = FinancialDate.parse('2028-02-29');
  const amount = Money.fromMinorUnits(12345, 'PHP');
  const debt = Debt.create({ id: debtId('D'), name: 'Synthetic debt', balance: amount, interest: { kind: 'unknown' } });
  const income = Income.create({ id: incomeId('I'), name: 'Synthetic income', amount, date, status: 'expected', recurrence: Recurrence.monthly(31) });
  const expense = EssentialObligation.create({ id: obligationId('E'), name: 'Synthetic expense', amount, date, recurrence: Recurrence.twiceMonthly(30, 31) });
  const payment = DebtPayment.create({ id: paymentId('P'), debtId: debt.id, amount, date });
  await createDebtRepository(db).save(debt);
  await createIncomeRepository(db).save(income);
  await createEssentialObligationRepository(db).save(expense);
  await createDebtPaymentRepository(db).save(payment);
  await createOnboardingRepository(db).markComplete();
  await writeProbe(db, 'synthetic-probe', amount, date);
  if (fail) {
    const failing: FinancialConnection = { ...db, async execAsync(sql) {
      if (sql === 'PRAGMA user_version = 4') throw new Error('synthetic version write');
      await db.execAsync(sql);
    } };
    await expect(runMigrations(failing)).rejects.toThrow('synthetic version write');
    expect(await db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 3 });
    expect(await db.getFirstAsync("SELECT name FROM sqlite_master WHERE name = 'available_money'")).toBeNull();
  }
  await db.closeAsync(); db = open();
  await initializeDatabase(db);
  await runMigrations(db); // Idempotence after retry.
  expect(await db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 4 });
  const repo = createAvailableMoneyRepository(db);
  await expect(repo.get()).resolves.toBeNull();
  await repo.save(snapshot(820050)); await repo.save(snapshot(675025));
  await expect(createDebtRepository(db).list()).resolves.toEqual([debt]);
  await expect(createIncomeRepository(db).list()).resolves.toEqual([income]);
  await expect(createEssentialObligationRepository(db).list()).resolves.toEqual([expense]);
  await expect(createDebtPaymentRepository(db).list()).resolves.toEqual([payment]);
  await expect(createOnboardingRepository(db).isComplete()).resolves.toBe(true);
  await expect(readProbe(db, 'synthetic-probe')).resolves.toEqual({ money: amount, date });
  expect(await db.getAllAsync('PRAGMA foreign_key_check')).toEqual([]);
  // Other financial records neither change nor derive this independent input.
  await createIncomeRepository(db).save(Income.create({ ...income, status: 'expected', amount: Money.zero('PHP') }));
  await expect(repo.get()).resolves.toEqual(snapshot(675025));
});

test('fresh get is missing; exact zero, replacement, maximum and reopen keep one current row', async () => {
  await initializeDatabase(db);
  let repo = createAvailableMoneyRepository(db);
  await expect(repo.get()).resolves.toBeNull();
  for (const units of [0, 820050, 675025, Number.MAX_SAFE_INTEGER, 0]) {
    await repo.save(snapshot(units));
    await db.closeAsync(); db = open(); await initializeDatabase(db);
    repo = createAvailableMoneyRepository(db);
    const result = await repo.get();
    expect(result).toEqual(snapshot(units));
    expect(Object.isFrozen(result)).toBe(true);
    expect(await db.getFirstAsync('SELECT COUNT(*) AS count, typeof(amount_minor_units) AS storage FROM available_money'))
      .toEqual({ count: 1, storage: 'integer' });
  }
});

test.each(['-1', '0.5', "'invalid'", '9007199254740993'])('SQL and repository reject corrupt amount %s before numeric conversion', async stored => {
  await initializeDatabase(db); await createAvailableMoneyRepository(db).save(snapshot(1));
  await expect(db.execAsync(`UPDATE available_money SET amount_minor_units = ${stored}`)).rejects.toThrow();
  await db.execAsync('PRAGMA ignore_check_constraints = ON');
  try { await db.execAsync(`UPDATE available_money SET amount_minor_units = ${stored}`); }
  finally { await db.execAsync('PRAGMA ignore_check_constraints = OFF'); }
  if (stored === '9007199254740993') {
    expect(await db.getFirstAsync('SELECT CAST(amount_minor_units AS TEXT) AS exact FROM available_money')).toEqual({ exact: stored });
  }
  const observed: unknown[] = [];
  const guarded: FinancialConnection = { ...db, async getAllAsync<T>(sql: string, ...params: SqlValue[]) {
    const rows = await db.getAllAsync<T>(sql, ...params);
    observed.push(...rows.map(row => (row as { amount_minor_units: unknown }).amount_minor_units));
    return rows;
  } };
  await expect(createAvailableMoneyRepository(guarded).get()).rejects.toThrow('Minor units must be a safe integer');
  expect(observed).toEqual(['invalid-integer']);
});

test.each(['USD', 'php', ' PHP '])('invalid currency is not normalized: %s', async currency => {
  await initializeDatabase(db); const repo = createAvailableMoneyRepository(db); await repo.save(snapshot(1));
  await expect(db.runAsync('UPDATE available_money SET currency = ?', currency)).rejects.toThrow();
  await db.execAsync('PRAGMA ignore_check_constraints = ON');
  try { await db.runAsync('UPDATE available_money SET currency = ?', currency); }
  finally { await db.execAsync('PRAGMA ignore_check_constraints = OFF'); }
  await expect(repo.get()).rejects.toThrow('Unsupported currency');
});

test.each([false, true])('singleton CHECK/PK prevent extra current rows; external corruption rejects, extra: %s', async extra => {
  await initializeDatabase(db); const repo = createAvailableMoneyRepository(db); await repo.save(snapshot(1));
  await expect(db.execAsync("INSERT INTO available_money VALUES (1, 2, 'PHP')")).rejects.toThrow();
  await expect(db.execAsync("INSERT INTO available_money VALUES (2, 2, 'PHP')")).rejects.toThrow();
  await db.execAsync('PRAGMA ignore_check_constraints = ON');
  try {
    if (extra) await db.execAsync("INSERT INTO available_money VALUES (2, 2, 'PHP')");
    else await db.execAsync('UPDATE available_money SET singleton_id = 9007199254740993');
  } finally { await db.execAsync('PRAGMA ignore_check_constraints = OFF'); }
  await expect(repo.get()).rejects.toThrow('Invalid available money singleton');
});

test('repository revalidates saves and never owns connection cleanup', async () => {
  await initializeDatabase(db); const repo = createAvailableMoneyRepository(db);
  await expect(repo.save({ ...snapshot(0) })).rejects.toThrow('Expected an AvailableMoney');
  const forged = Object.assign(Object.create(AvailableMoney.prototype), { amount: Money.fromMinorUnits(-1, 'PHP') }) as AvailableMoney;
  await expect(repo.save(forged)).rejects.toThrow();
  await expect(repo.get()).resolves.toBeNull();
  const close = jest.fn(db.closeAsync); const failure = new Error('synthetic I/O');
  const failing = createAvailableMoneyRepository({ ...db, closeAsync: close,
    async getAllAsync() { throw failure; }, async runAsync() { throw failure; } });
  await expect(failing.get()).rejects.toBe(failure);
  await expect(failing.save(snapshot(0))).rejects.toBe(failure);
  expect(close).not.toHaveBeenCalled();
});

test('application replaces the singleton across reopen and post-commit close failure retry', async () => {
  await db.closeAsync();
  let failClose = true;
  const initialized = async () => {
    const connection = open();
    try { await initializeDatabase(connection); } catch (error) { await connection.closeAsync(); throw error; }
    return { ...connection, async closeAsync() {
      await connection.closeAsync();
      if (failClose) { failClose = false; throw new Error('synthetic post-commit close'); }
    } };
  };
  const deps = { open: initialized, repository: createAvailableMoneyRepository };
  await expect(saveAvailableMoney('8200.50', deps)).rejects.toThrow('synthetic post-commit close');
  await saveAvailableMoney('8200.50', deps);
  await expect(readAvailableMoney(deps)).resolves.toEqual(snapshot(820050));
  await saveAvailableMoney('6750.25', deps);
  await expect(readAvailableMoney(deps)).resolves.toEqual(snapshot(675025));
  await saveAvailableMoney('0', deps);
  await expect(readAvailableMoney(deps)).resolves.toEqual(snapshot(0));
  db = open();
  expect(await db.getFirstAsync('SELECT COUNT(*) AS count FROM available_money')).toEqual({ count: 1 });
});
