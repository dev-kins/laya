/// <reference types="node" />
// Real file-backed host SQLite, not proof of the Expo/Android bridge.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { Debt, type DebtInput, type Interest } from '../../domain/Debt';
import { DebtPayment } from '../../domain/DebtPayment';
import { EssentialObligation } from '../../domain/EssentialObligation';
import { FinancialDate } from '../../domain/FinancialDate';
import { debtId, incomeId, obligationId, paymentId } from '../../domain/identifiers';
import { Income, type IncomeInput } from '../../domain/Income';
import { Money } from '../../domain/Money';
import { Recurrence } from '../../domain/Recurrence';
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
function open(): FinancialConnection {
  const native = new DatabaseSync(join(directory, 'financial.db'));
  return {
    async execAsync(sql) { native.exec(sql); },
    async getFirstAsync<T>(sql: string, ...params: SqlValue[]) {
      return (native.prepare(sql).get(...params) as T | undefined) ?? null;
    },
    async getAllAsync<T>(sql: string, ...params: SqlValue[]) { return native.prepare(sql).all(...params) as T[]; },
    async runAsync(sql, ...params) { return native.prepare(sql).run(...params); },
    async closeAsync() { native.close(); },
  };
}
beforeEach(() => { directory = mkdtempSync(join(tmpdir(), 'laya-financial-')); db = open(); });
afterEach(async () => { await db.closeAsync(); rmSync(directory, { recursive: true, force: true }); });
async function reopen() {
  await db.closeAsync();
  db = open();
  await initializeDatabase(db);
}

const money = (value: number) => Money.fromMinorUnits(value, 'PHP');
const date = FinancialDate.parse('2028-02-29');
const later = FinancialDate.parse('2028-03-31');
const debt = (id = 'D', overrides: Partial<DebtInput> = {}) => Debt.create({
  id: debtId(id), name: 'Synthetic debt', balance: money(176425), interest: { kind: 'unknown' }, ...overrides,
});
const income = (id = 'I', overrides: Partial<IncomeInput> = {}) => Income.create({
  id: incomeId(id), name: 'Synthetic income', amount: money(100), date, status: 'expected', ...overrides,
} as IncomeInput);
const obligation = (id = 'O', recurrence?: Recurrence, amount = 100) => EssentialObligation.create({
  id: obligationId(id), name: 'Synthetic obligation', amount: money(amount), date, recurrence,
});
const payment = (id = 'P', amount = 50, parent = 'D') => DebtPayment.create({
  id: paymentId(id), debtId: debtId(parent), amount: money(amount), date,
});

test('fresh schema is version 3 with exactly the existing and four financial tables', async () => {
  await initializeDatabase(db);
  expect(await db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 3 });
  expect(await db.getFirstAsync('PRAGMA foreign_keys')).toEqual({ foreign_keys: 1 });
  expect(await db.getAllAsync("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")).toEqual([
    'app_preferences', 'debt_payments', 'debts', 'essential_obligations', 'incomes', 'infrastructure_probe',
  ].map(name => ({ name })));
});

test.each([false, true])('upgrade v2 preserves data; injected version-write failure: %s', async (fail) => {
  await initializeDatabase(db, migrations.slice(0, 2));
  await createOnboardingRepository(db).markComplete();
  await db.runAsync('INSERT INTO app_preferences VALUES (?, ?)', 'synthetic-preference', 'kept');
  await writeProbe(db, 'existing', money(176425), date);
  if (fail) {
    const failing: FinancialConnection = { ...db, async execAsync(sql) {
      if (sql === 'PRAGMA user_version = 3') throw new Error('synthetic version failure');
      await db.execAsync(sql);
    } };
    await expect(runMigrations(failing)).rejects.toThrow('synthetic version failure');
    expect(await db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 2 });
    expect(await db.getAllAsync("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")).toEqual([
      { name: 'app_preferences' }, { name: 'infrastructure_probe' },
    ]);
    expect(await db.getFirstAsync("SELECT name FROM sqlite_master WHERE name = 'debt_payments_debt_id'")).toBeNull();
  }
  await reopen();
  await runMigrations(db); // Retry/idempotence does not recreate tables.
  expect(await db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 3 });
  expect(await db.getFirstAsync('PRAGMA foreign_keys')).toEqual({ foreign_keys: 1 });
  await expect(createOnboardingRepository(db).isComplete()).resolves.toBe(true);
  expect(await db.getFirstAsync('SELECT value FROM app_preferences WHERE key = ?', 'synthetic-preference'))
    .toEqual({ value: 'kept' });
  expect(await readProbe(db, 'existing')).toEqual({ money: money(176425), date });
});

const interests: readonly Interest[] = [
  { kind: 'unknown' }, { kind: 'known', basisPoints: 0, period: 'monthly' },
  { kind: 'known', basisPoints: 125, period: 'monthly' }, { kind: 'known', basisPoints: 1800, period: 'annual' },
  { kind: 'known', basisPoints: Number.MAX_SAFE_INTEGER, period: 'annual' },
];
test.each(interests)('debt preserves explicit interest %j', async (interest) => {
  await initializeDatabase(db);
  const original = debt('D', { interest, provider: 'Synthetic provider' });
  await createDebtRepository(db).save(original);
  await expect(createDebtRepository(db).getById(original.id)).resolves.toEqual(original);
});

test.each(Array.from({ length: 8 }, (_, mask) => mask))('debt schedule fields are independently optional: %s', async (mask) => {
  await initializeDatabase(db);
  const original = debt('D', {
    scheduledPayment: mask & 1 ? money(0) : undefined,
    nextDueDate: mask & 2 ? date : undefined,
    recurrence: mask & 4 ? Recurrence.twiceMonthly(30, 31) : undefined,
  });
  await createDebtRepository(db).save(original);
  await expect(createDebtRepository(db).getById(original.id)).resolves.toEqual(original);
});

test.each([0, Number.MAX_SAFE_INTEGER])('debt monetary boundary %s and monthly day 31 survive', async (amount) => {
  await initializeDatabase(db);
  const original = debt('D', { balance: money(amount), scheduledPayment: money(amount), recurrence: Recurrence.monthly(31) });
  await createDebtRepository(db).save(original);
  await expect(createDebtRepository(db).getById(original.id)).resolves.toEqual(original);
  expect(await db.getFirstAsync('SELECT typeof(balance_minor_units) AS storage, currency FROM debts'))
    .toEqual({ storage: 'integer', currency: 'PHP' });
});

test.each([
  income(), income('I', { recurrence: Recurrence.monthly(31) }),
  income('I', { recurrence: Recurrence.twiceMonthly(30, 31) }), income('I', { status: 'received' }),
  income('I', { amount: money(0) }), income('I', { amount: money(Number.MAX_SAFE_INTEGER) }),
])('income round trip %#', async (original) => {
  await initializeDatabase(db);
  await createIncomeRepository(db).save(original);
  await expect(createIncomeRepository(db).getById(original.id)).resolves.toEqual(original);
});

test.each([
  obligation(), obligation('O', Recurrence.monthly(31)), obligation('O', Recurrence.twiceMonthly(30, 31)),
  obligation('O', undefined, 0), obligation('O', undefined, Number.MAX_SAFE_INTEGER),
])('obligation round trip %#', async (original) => {
  await initializeDatabase(db);
  await createEssentialObligationRepository(db).save(original);
  await expect(createEssentialObligationRepository(db).getById(original.id)).resolves.toEqual(original);
});

test.each([1, 50, 176426, Number.MAX_SAFE_INTEGER])('payment %s is historical, including above current balance', async (amount) => {
  await initializeDatabase(db);
  await createDebtRepository(db).save(debt());
  const original = payment('P', amount);
  await createDebtPaymentRepository(db).save(original);
  await expect(createDebtPaymentRepository(db).getById(original.id)).resolves.toEqual(original);
  await expect(createDebtRepository(db).getById(debtId('D'))).resolves.toEqual(debt());
});

test.each(['1', '0', '0.5', '9007199254740993'])('payment SQL read guard filters before mapping: %s', async (stored) => {
  await initializeDatabase(db);
  await createDebtRepository(db).save(debt());
  await createDebtPaymentRepository(db).save(payment('P', 1));
  await db.execAsync('PRAGMA ignore_check_constraints = ON');
  try { await db.execAsync(`UPDATE debt_payments SET amount_minor_units = ${stored}`); }
  finally { await db.execAsync('PRAGMA ignore_check_constraints = OFF'); }
  expect(await db.getFirstAsync('SELECT CAST(amount_minor_units AS TEXT) AS exact FROM debt_payments'))
    .toEqual({ exact: stored });

  // Observe actual host-driver results before repository mapping. This detects
  // zero reaching JavaScript as a number even if the domain later rejects it.
  const observed: unknown[] = [];
  const connection: FinancialConnection = { ...db,
    async getFirstAsync<T>(sql: string, ...params: SqlValue[]) {
      const row = await db.getFirstAsync<T>(sql, ...params);
      observed.push((row as { amount_minor_units: unknown } | null)?.amount_minor_units);
      return row;
    },
    async getAllAsync<T>(sql: string, ...params: SqlValue[]) {
      const rows = await db.getAllAsync<T>(sql, ...params);
      observed.push(...rows.map(row => (row as { amount_minor_units: unknown }).amount_minor_units));
      return rows;
    },
  };
  const repo = createDebtPaymentRepository(connection);
  if (stored === '1') {
    await expect(repo.getById(paymentId('P'))).resolves.toEqual(payment('P', 1));
    await expect(repo.list()).resolves.toEqual([payment('P', 1)]);
    expect(observed).toEqual([1, 1]);
  } else {
    await expect(repo.getById(paymentId('P'))).rejects.toThrow('Minor units must be a safe integer.');
    await expect(repo.list()).rejects.toThrow('Minor units must be a safe integer.');
    expect(observed).toEqual(['invalid-integer', 'invalid-integer']);
  }
});

// Shared behavioral contract, using entity-specific factories (no production generic repository).
const fixtures = [
  { table: 'debts', make: (connection: FinancialConnection) => {
    const repo = createDebtRepository(connection);
    return { save: (id: string, revised = false) => {
      const value = revised ? debt(id, { name: 'Revised', balance: money(0) }) : debt(id, {
        provider: 'Synthetic provider', scheduledPayment: money(10), nextDueDate: date,
        recurrence: Recurrence.twiceMonthly(30, 31), interest: { kind: 'known', basisPoints: 10, period: 'annual' },
      });
      return repo.save(value).then(() => value);
    }, get: (id: string) => repo.getById(debtId(id)), list: () => repo.list() };
  } },
  { table: 'incomes', make: (connection: FinancialConnection) => {
    const repo = createIncomeRepository(connection);
    return { save: (id: string, revised = false) => {
      const value = revised ? income(id, { name: 'Revised', amount: money(0), date: later, status: 'received' })
        : income(id, { recurrence: Recurrence.twiceMonthly(30, 31) });
      return repo.save(value).then(() => value);
    }, get: (id: string) => repo.getById(incomeId(id)), list: () => repo.list() };
  } },
  { table: 'essential_obligations', make: (connection: FinancialConnection) => {
    const repo = createEssentialObligationRepository(connection);
    return { save: (id: string, revised = false) => {
      const value = revised ? EssentialObligation.create({ ...obligation(id), name: 'Revised', date: later, amount: money(0) })
        : obligation(id, Recurrence.twiceMonthly(30, 31));
      return repo.save(value).then(() => value);
    }, get: (id: string) => repo.getById(obligationId(id)), list: () => repo.list() };
  } },
  { table: 'debt_payments', make: (connection: FinancialConnection) => {
    const repo = createDebtPaymentRepository(connection);
    return { save: (id: string, revised = false) => {
      const value = revised ? DebtPayment.create({ ...payment(id, 1, 'E'), date: later }) : payment(id);
      return repo.save(value).then(() => value);
    }, get: (id: string) => repo.getById(paymentId(id)), list: () => repo.list() };
  } },
];

describe.each(fixtures)('$table repository', ({ table, make }) => {
  beforeEach(async () => {
    await initializeDatabase(db);
    if (table === 'debt_payments') {
      await createDebtRepository(db).save(debt());
      await createDebtRepository(db).save(debt('E'));
    }
  });
  test('get/list, exact-case IDs, whole-snapshot upsert, deterministic order and reopen', async () => {
    let repo = make(db);
    await expect(repo.get('missing')).resolves.toBeNull();
    await expect(repo.list()).resolves.toEqual([]);
    const lower = await repo.save('a');
    const upper = await repo.save('A');
    await expect(repo.get('A')).resolves.toEqual(upper);
    await expect(repo.list()).resolves.toEqual([upper, lower]);
    const revised = await repo.save('A', true);
    const longId = 'z'.repeat(128);
    const long = await repo.save(longId);
    await reopen();
    repo = make(db);
    await expect(repo.get('A')).resolves.toEqual(revised);
    await expect(repo.get('a')).resolves.toEqual(lower);
    await expect(repo.get(longId)).resolves.toEqual(long);
    await expect(repo.list()).resolves.toEqual([revised, lower, long]);
  });
  test.each(['', ' padded', 'padded ', 'x'.repeat(129)])('invalid stored ID is rejected %#', async (badId) => {
    const repo = make(db);
    await repo.save('valid');
    await db.runAsync(`UPDATE ${table} SET id = ?`, badId);
    await expect(repo.list()).rejects.toThrow();
  });
  test('all SQL data remains bound, including quote-containing identifiers', async () => {
    const repo = make(db);
    const id = "x'; DROP TABLE debts; --";
    const original = await repo.save(id);
    await expect(repo.get(id)).resolves.toEqual(original);
    await expect(repo.list()).resolves.toEqual([original]);
  });
});

test('FK blocks missing parents, failed updates and debt deletion; debt upsert retains history', async () => {
  await initializeDatabase(db);
  const debts = createDebtRepository(db);
  const payments = createDebtPaymentRepository(db);
  await expect(payments.save(payment())).rejects.toThrow();
  await debts.save(debt());
  await payments.save(payment());
  await expect(payments.save(payment('P', 1, 'missing'))).rejects.toThrow();
  await expect(payments.getById(paymentId('P'))).resolves.toEqual(payment());
  await expect(db.runAsync('DELETE FROM debts WHERE id = ?', 'D')).rejects.toThrow();
  await expect(db.runAsync('UPDATE debts SET id = ? WHERE id = ?', 'renamed', 'D')).rejects.toThrow();
  await debts.save(debt('D', { balance: money(0) }));
  await expect(payments.list()).resolves.toEqual([payment()]);
  expect(await db.getAllAsync('PRAGMA foreign_key_check')).toEqual([]);
});

test.each([0, -1])('payment %s rejected by domain and SQL', async (amount) => {
  await initializeDatabase(db);
  await createDebtRepository(db).save(debt());
  expect(() => payment('P', amount)).toThrow();
  await expect(db.runAsync('INSERT INTO debt_payments VALUES (?, ?, ?, ?, ?)',
    'P', 'D', amount, 'PHP', date.toString())).rejects.toThrow();
});

test('orphan created with foreign keys bypassed is surfaced on get and list', async () => {
  await initializeDatabase(db);
  await createDebtRepository(db).save(debt());
  await createDebtPaymentRepository(db).save(payment());
  await db.execAsync('PRAGMA foreign_keys = OFF');
  await db.runAsync('DELETE FROM debts');
  await db.execAsync('PRAGMA foreign_keys = ON');
  await expect(createDebtPaymentRepository(db).getById(paymentId('P'))).rejects.toThrow('missing debt');
  await expect(createDebtPaymentRepository(db).list()).rejects.toThrow('missing debt');
});

const invalidMoney = [
  "9007199254740993", "-9007199254740993", "-1", "0.5", "'not-an-integer'",
];
const invalidRecurrences = [
  "recurrence_kind = 'weekly'",
  "recurrence_kind = NULL, recurrence_day_1 = 1",
  "recurrence_kind = 'monthly', recurrence_day_1 = NULL",
  "recurrence_kind = 'monthly', recurrence_day_1 = 0",
  "recurrence_kind = 'monthly', recurrence_day_1 = 32",
  "recurrence_kind = 'monthly', recurrence_day_1 = 1.5",
  "recurrence_kind = 'monthly', recurrence_day_1 = 9007199254740993",
  "recurrence_kind = 'monthly', recurrence_day_1 = 1, recurrence_day_2 = 2",
  "recurrence_kind = 'twice-monthly', recurrence_day_1 = 30, recurrence_day_2 = NULL",
  "recurrence_kind = 'twice-monthly', recurrence_day_1 = 31, recurrence_day_2 = 30",
  "recurrence_kind = 'twice-monthly', recurrence_day_1 = 30, recurrence_day_2 = 30",
  "recurrence_kind = 'twice-monthly', recurrence_day_1 = 30, recurrence_day_2 = 9007199254740993",
];
const invalidInterests = [
  "interest_kind = 'unspecified'",
  "interest_kind = 'unknown', interest_basis_points = 0",
  "interest_kind = 'unknown', interest_period = 'monthly'",
  "interest_kind = 'known', interest_basis_points = NULL, interest_period = 'monthly'",
  "interest_kind = 'known', interest_basis_points = 0, interest_period = NULL",
  "interest_kind = 'known', interest_basis_points = 0, interest_period = 'weekly'",
  ...invalidMoney.map(value => `interest_kind = 'known', interest_basis_points = ${value}, interest_period = 'monthly'`),
];

describe.each(fixtures)('$table corruption boundary', ({ table, make }) => {
  const amountColumn = table === 'debts' ? 'balance_minor_units' : 'amount_minor_units';
  const dateColumn = table === 'debts' ? 'next_due_date' : 'financial_date';
  const corruptions = [
    ...invalidMoney.map(value => `${amountColumn} = ${value}`),
    "currency = 'USD'",
    `${dateColumn} = '2027-02-29'`,
    `${dateColumn} = '2028-2-29'`,
    `${dateColumn} = '2028-02-29T00:00:00Z'`,
    `${dateColumn} = '0000-01-01'`,
    ...(table === 'debt_payments' ? ["amount_minor_units = 0"] : [
      "name = ' padded '", "name = ''", "name = X'FF'",
      `name = '${'x'.repeat(201)}'`, ...invalidRecurrences,
    ]),
    ...(table === 'debts' ? [
      ...invalidInterests,
      ...invalidMoney.map(value => `scheduled_payment_minor_units = ${value}`),
      "provider = ''", "provider = ' padded '",
    ] : []),
    ...(table === 'incomes' ? [
      "status = 'unknown'",
      "status = 'received', recurrence_kind = 'monthly', recurrence_day_1 = 31, recurrence_day_2 = NULL",
    ] : []),
  ];
  test.each(corruptions)('get and list reject corrupt storage %#', async (update) => {
    await initializeDatabase(db);
    if (table === 'debt_payments') await createDebtRepository(db).save(debt());
    const repo = make(db);
    await repo.save('valid');
    // Only the test's disposable database: simulate legacy/external corruption.
    await db.execAsync('PRAGMA ignore_check_constraints = ON');
    try { await db.execAsync(`UPDATE ${table} SET ${update}`); }
    finally { await db.execAsync('PRAGMA ignore_check_constraints = OFF'); }
    await expect(repo.get('valid')).rejects.toThrow();
    await expect(repo.list()).rejects.toThrow();
    await expect(repo.get('missing')).resolves.toBeNull();
  });
  test('unsafe INTEGER remains exact in SQLite but is rejected before driver number conversion', async () => {
    await initializeDatabase(db);
    if (table === 'debt_payments') await createDebtRepository(db).save(debt());
    const repo = make(db);
    await repo.save('valid');
    await db.execAsync('PRAGMA ignore_check_constraints = ON');
    try { await db.execAsync(`UPDATE ${table} SET ${amountColumn} = 9007199254740993`); }
    finally { await db.execAsync('PRAGMA ignore_check_constraints = OFF'); }
    expect(await db.getFirstAsync(`SELECT CAST(${amountColumn} AS TEXT) AS exact FROM ${table}`))
      .toEqual({ exact: '9007199254740993' });
    // A raw Node SQLite read throws RangeError before a mapper could see it.
    // Our guarded SELECT instead reaches Money's explicit type validation.
    await expect(repo.get('valid')).rejects.toThrow('Minor units must be a safe integer.');
    await expect(repo.list()).rejects.toThrow('Minor units must be a safe integer.');
  });
  test.each([...invalidMoney.map(value => `${amountColumn} = ${value}`), "currency = 'USD'"])
  ('SQL constraints block corrupt numeric/currency writes %#', async (update) => {
    await initializeDatabase(db);
    if (table === 'debt_payments') await createDebtRepository(db).save(debt());
    const repo = make(db);
    const original = await repo.save('valid');
    await expect(db.execAsync(`UPDATE ${table} SET ${update}`)).rejects.toThrow();
    await expect(repo.get('valid')).resolves.toEqual(original);
  });
});

test.each([...invalidRecurrences, ...invalidInterests])('SQL debt shape constraints reject invalid combinations %#', async (update) => {
  await initializeDatabase(db);
  await createDebtRepository(db).save(debt());
  await expect(db.execAsync(`UPDATE debts SET ${update}`)).rejects.toThrow();
  await expect(createDebtRepository(db).getById(debtId('D'))).resolves.toEqual(debt());
});

test('SQL rejects received income with recurrence', async () => {
  await initializeDatabase(db);
  await createIncomeRepository(db).save(income('I', { recurrence: Recurrence.monthly(31) }));
  await expect(db.execAsync("UPDATE incomes SET status = 'received'")).rejects.toThrow();
});

// Forged instances exercise the runtime save boundary despite TypeScript types.
function forged<T extends object>(original: T, patch: object): T {
  return Object.assign(Object.create(Object.getPrototypeOf(original)), original, patch) as T;
}
test('save revalidates every entity before writing and rejects raw DTOs', async () => {
  await initializeDatabase(db);
  const debts = createDebtRepository(db);
  const incomes = createIncomeRepository(db);
  const obligations = createEssentialObligationRepository(db);
  const payments = createDebtPaymentRepository(db);
  await debts.save(debt());
  await incomes.save(income());
  await obligations.save(obligation());
  await payments.save(payment());
  await expect(debts.save(forged(debt(), { balance: money(-1) }))).rejects.toThrow();
  await expect(incomes.save(forged(income(), { status: 'received', recurrence: Recurrence.monthly(1) }))).rejects.toThrow();
  await expect(obligations.save(forged(obligation(), { amount: money(-1) }))).rejects.toThrow();
  await expect(payments.save(forged(payment(), { amount: money(0) }))).rejects.toThrow();
  await expect(debts.save({ ...debt() })).rejects.toThrow('Expected a Debt entity');
  await expect(incomes.save({ ...income() })).rejects.toThrow('Expected an Income entity');
  await expect(obligations.save({ ...obligation() })).rejects.toThrow('Expected an EssentialObligation entity');
  await expect(payments.save({ ...payment() })).rejects.toThrow('Expected a DebtPayment entity');
  await expect(debts.list()).resolves.toEqual([debt()]);
  await expect(incomes.list()).resolves.toEqual([income()]);
  await expect(obligations.list()).resolves.toEqual([obligation()]);
  await expect(payments.list()).resolves.toEqual([payment()]);
});

test('repository failures propagate and never close the caller-owned connection', async () => {
  await initializeDatabase(db);
  const failure = new Error('synthetic I/O failure');
  const close = jest.fn(db.closeAsync);
  const failing: FinancialConnection = { ...db, closeAsync: close,
    async getFirstAsync() { throw failure; }, async getAllAsync() { throw failure; },
    async runAsync() { throw failure; },
  };
  for (const { make } of fixtures) {
    const repo = make(failing);
    await expect(repo.save('valid')).rejects.toBe(failure);
    await expect(repo.get('valid')).rejects.toBe(failure);
    await expect(repo.list()).rejects.toBe(failure);
  }
  expect(close).not.toHaveBeenCalled();
});
