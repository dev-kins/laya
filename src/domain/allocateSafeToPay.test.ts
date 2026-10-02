import { allocateSafeToPay } from './allocateSafeToPay';
import { calculateSafeToPay, type SafeToPayResult } from './calculateSafeToPay';
import { Debt, type DebtInput } from './Debt';
import { FinancialDate } from './FinancialDate';
import { FinancialEvent } from './FinancialEvent';
import { debtId } from './identifiers';
import { Money } from './Money';
import { orderDebtsForLayaAdaptive } from './orderDebtsForLayaAdaptive';
import { orderDebtsForStrategy } from './orderDebtsForStrategy';
import { projectCashFlow } from './projectCashFlow';
import { Recurrence } from './Recurrence';

const php = (units: number) => Money.fromMinorUnits(units, 'PHP');
const date = FinancialDate.parse;
const debt = (id: string, units: number, patch: Partial<DebtInput> = {}) =>
  Debt.create({ id: debtId(id), name: 'Synthetic debt', balance: php(units), interest: { kind: 'unknown' }, ...patch });
const capacity = (units: number): SafeToPayResult => ({ amount: php(units),
  protectionStartDate: date('2026-10-02'), protectionThroughDate: date('2026-12-01') });
const run = (orderedDebts: readonly Debt[], units: number) => allocateSafeToPay({ orderedDebts, safeToPay: capacity(units) });
const summary = (orderedDebts: readonly Debt[], units: number) => run(orderedDebts, units).allocations.map(a => [a.debt.id, a.amount.minorUnits, a.coverage]);

test('zero capacity emits no allocation even with positive balances', () => {
  expect(run([debt('a', 100), debt('b', 200)], 0)).toEqual({ allocations: [], totalAllocated: php(0),
    remainingSafeToPay: php(0), protectionStartDate: date('2026-10-02'), protectionThroughDate: date('2026-12-01') });
});
test.each([0, 500000, Number.MAX_SAFE_INTEGER])('empty order leaves capacity %s untouched', units => {
  const result = run([], units);
  expect(result.allocations).toEqual([]); expect(result.totalAllocated).toEqual(php(0)); expect(result.remainingSafeToPay).toEqual(php(units));
});
test.each([
  [10000, 9999, 9999, 'partial', 0], [10000, 10000, 10000, 'full', 0], [10000, 10001, 10000, 'full', 1],
  [150000, 300000, 150000, 'full', 150000], [200000, 150000, 150000, 'partial', 0],
  [1, 1, 1, 'full', 0],
  [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, 'full', 0],
  [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER - 1, Number.MAX_SAFE_INTEGER - 1, 'partial', 0],
])('single balance %s with budget %s allocates %s %s leaving %s', (balance, units, amount, coverage, remaining) => {
  const record = debt('a', balance); const result = run([record], units);
  expect(result.allocations).toEqual([{ debt: record, amount: php(amount), coverage }]);
  expect(result.allocations[0].debt).toBe(record);
  expect(result.totalAllocated).toEqual(php(amount)); expect(result.remainingSafeToPay).toEqual(php(remaining));
});
test('multiple full allocations leave unused capacity without overpayment', () => {
  const result = run([debt('a', 200000), debt('b', 300000)], 1000000);
  expect(result.allocations.map(a => [a.debt.id, a.amount.minorUnits, a.coverage])).toEqual([['a', 200000, 'full'], ['b', 300000, 'full']]);
  expect(result.totalAllocated).toEqual(php(500000)); expect(result.remainingSafeToPay).toEqual(php(500000));
});
test.each([300000, 350000])('full then partial/exact exhaustion stops before later debt: %s', units => {
  const result = run([debt('a', 150000), debt('b', 200000), debt('c', 1)], units);
  expect(result.allocations.map(a => [a.debt.id, a.amount.minorUnits, a.coverage])).toEqual([
    ['a', 150000, 'full'], ['b', units === 300000 ? 150000 : 200000, units === 300000 ? 'partial' : 'full'],
  ]);
  expect(result.totalAllocated).toEqual(php(units)); expect(result.remainingSafeToPay).toEqual(php(0));
});
test('zero balances before, between and after positives consume nothing and emit no entries', () => {
  const records = [debt('zero-1', 0), debt('a', 1), debt('zero-2', 0), debt('b', 2), debt('zero-3', 0)];
  expect(summary(records, 4)).toEqual([['a', 1, 'full'], ['b', 2, 'full']]);
  expect(run(records, 4).remainingSafeToPay).toEqual(php(1));
  const onlyZero = run([records[0], records[2], records[4]], 4);
  expect(onlyZero.allocations).toEqual([]); expect(onlyZero.totalAllocated).toEqual(php(0)); expect(onlyZero.remainingSafeToPay).toEqual(php(4));
});
test('exact decimal centavos survive multiple allocations', () => {
  const result = allocateSafeToPay({ orderedDebts: [debt('a', 5001), debt('b', 5001)],
    safeToPay: { ...capacity(0), amount: Money.parse('100.01', 'PHP') } });
  expect(result.allocations.map(a => [a.amount, a.coverage])).toEqual([[Money.parse('50.01', 'PHP'), 'full'], [Money.parse('50.00', 'PHP'), 'partial']]);
  expect(result.totalAllocated).toEqual(php(10001)); expect(result.remainingSafeToPay).toEqual(php(0));
});
test('aggregate reported balances may exceed safe range while bounded allocation remains exact', () => {
  const max = Number.MAX_SAFE_INTEGER;
  const result = run([debt('a', max - 1), debt('b', max), debt('c', max)], max);
  expect(result.allocations.map(a => [a.amount.minorUnits, a.coverage])).toEqual([[max - 1, 'full'], [1, 'partial']]);
  expect(result.totalAllocated).toEqual(php(max)); expect(result.remainingSafeToPay).toEqual(php(0));
});
test('allocation invariants hold across bounded synthetic orders and budget boundaries', () => {
  for (const balances of [[], [0, 0], [0, 1, 2], [5, 2, 7], [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]]) {
    const records = balances.map((balance, i) => debt(String(i), balance));
    for (const units of [0, 1, 2, 5, 14, 15, Number.MAX_SAFE_INTEGER]) {
      const result = run(records, units);
      let total = php(0);
      for (const entry of result.allocations) {
        expect(entry.amount.compare(php(0))).toBe(1);
        expect(entry.amount.compare(entry.debt.balance)).toBeLessThanOrEqual(0);
        total = total.add(entry.amount);
        expect(entry.coverage).toBe(entry.amount.equals(entry.debt.balance) ? 'full' : 'partial');
      }
      expect(total).toEqual(result.totalAllocated); expect(total.compare(php(units))).toBeLessThanOrEqual(0);
      expect(result.remainingSafeToPay.compare(php(0))).toBeGreaterThanOrEqual(0);
      expect(total.add(result.remainingSafeToPay)).toEqual(php(units));
    }
  }
});
test('caller order is authoritative: reversing equal debts changes the recipient', () => {
  const a = debt('a', 200000), b = debt('b', 200000);
  expect(summary([a, b], 200000)).toEqual([['a', 200000, 'full']]);
  expect(summary([b, a], 200000)).toEqual([['b', 200000, 'full']]);
});
test.each(['snowball', 'avalanche'] as const)('composes directly with %s output', strategy => {
  const records = [debt('A', 150000, { interest: { kind: 'known', basisPoints: 500, period: 'annual' } }),
    debt('B', 800000, { interest: { kind: 'known', basisPoints: 2400, period: 'annual' } }),
    debt('C', 400000, { interest: { kind: 'known', basisPoints: 1800, period: 'annual' } })];
  const orderedDebts = orderDebtsForStrategy({ strategy, debts: records }).orderedDebts;
  expect(summary(orderedDebts, 300000)).toEqual(strategy === 'snowball'
    ? [['A', 150000, 'full'], ['C', 150000, 'partial']] : [['B', 300000, 'partial']]);
});
test('Adaptive individual clearability becomes cumulative full then partial allocation', () => {
  const safeToPay = capacity(300000);
  const adaptive = orderDebtsForLayaAdaptive({ debts: [debt('B', 200000), debt('A', 150000)], safeToPay });
  expect(adaptive.orderedEntries.map(e => [e.debt.id, e.category])).toEqual([
    ['A', 'clearable-within-safe-to-pay'], ['B', 'clearable-within-safe-to-pay'],
  ]);
  const result = allocateSafeToPay({ orderedDebts: adaptive.orderedEntries.map(e => e.debt), safeToPay });
  expect(result.allocations.map(a => [a.debt.id, a.amount.minorUnits, a.coverage])).toEqual([['A', 150000, 'full'], ['B', 150000, 'partial']]);
  expect(result.totalAllocated).toEqual(php(300000)); expect(result.remainingSafeToPay).toEqual(php(0));
});
test('real upstream capacity is consumed without adding scheduled payments or using starting cash', () => {
  const record = debt('a', 500000, { scheduledPayment: php(100000), nextDueDate: date('2026-10-03'), recurrence: Recurrence.monthly(3) });
  const projection = projectCashFlow({ startingBalance: php(300000), startDate: date('2026-10-02'), through: date('2026-10-10'),
    events: [FinancialEvent.create({ kind: 'debt-due', sourceId: record.id, amount: record.scheduledPayment!,
      date: record.nextDueDate!, occurrenceKey: 'one-time' })] });
  const safeToPay = calculateSafeToPay(projection);
  expect(safeToPay.amount).toEqual(php(200000));
  const result = allocateSafeToPay({ orderedDebts: [record], safeToPay });
  expect(result.allocations).toEqual([{ debt: record, amount: php(200000), coverage: 'partial' }]);
  expect(record.balance).toEqual(php(500000)); expect(record.scheduledPayment).toEqual(php(100000));
});
test.each([0, 1, 100])('duplicate identities reject before any allocation at budget %s', units => {
  const first = debt('same', 1); const subtract = jest.spyOn(Money.prototype, 'subtract');
  try {
    for (const duplicate of [first, debt('same', 50)]) {
      expect(() => run([first, debt('other', 1), duplicate], units)).toThrow('Duplicate debt identity');
    }
    expect(subtract).not.toHaveBeenCalled();
  } finally { subtract.mockRestore(); }
});
test.each([null, undefined, {}, { id: 'raw', balance: 100 }])('invalid Debt entry rejects even after potential exhaustion %#', entry => {
  expect(() => run([debt('first', 1), entry as unknown as Debt], 1)).toThrow('Allocation entries must be Debt instances');
});
test('invalid consumed Money rejects on either boundary, including debt after exhaustion', () => {
  const forged = (patch: object) => Object.assign(Object.create(Money.prototype), { currency: 'PHP', minorUnits: 1 }, patch) as Money;
  const invalid: unknown[] = [null, php(-1), { minorUnits: 1, currency: 'PHP' }, forged({ currency: 'USD' }),
    forged({ minorUnits: 0.5 }), forged({ minorUnits: Number.MAX_SAFE_INTEGER + 1 }), forged({ minorUnits: NaN })];
  for (const value of invalid) {
    expect(() => allocateSafeToPay({ orderedDebts: [], safeToPay: { ...capacity(0), amount: value as Money } })).toThrow();
    const malformed = Object.assign(Object.create(Debt.prototype), debt('bad', 1), { balance: value }) as Debt;
    expect(() => run([debt('first', 1), malformed], 1)).toThrow();
    expect(() => run([malformed], 0)).toThrow();
  }
});
test('invalid Safe-to-Pay shapes and windows reject even for empty debt order', () => {
  const valid = capacity(0);
  for (const value of [null, undefined, {}, { ...valid, protectionStartDate: '2026-10-02' },
    { ...valid, protectionThroughDate: { year: 2026, month: 12, day: 1 } }, { ...valid, protectionThroughDate: date('2026-10-01') }]) {
    expect(() => allocateSafeToPay({ orderedDebts: [], safeToPay: value as SafeToPayResult })).toThrow();
  }
});
test.each([['2026-10-02', '2026-10-02'], ['0001-01-01', '9999-12-31']])('preserves supplied protection window %s through %s', (start, through) => {
  const safeToPay = { ...capacity(1), protectionStartDate: date(start), protectionThroughDate: date(through) };
  const result = allocateSafeToPay({ orderedDebts: [debt('a', 1)], safeToPay });
  expect(result.protectionStartDate).toEqual(safeToPay.protectionStartDate);
  expect(result.protectionThroughDate).toEqual(safeToPay.protectionThroughDate);
});
test('freezes outputs and preserves original Debt references, input order, values and repeatability', () => {
  const a = debt('a', 1), b = debt('b', 2); const orderedDebts = [b, a], safeToPay = capacity(3);
  const before = JSON.stringify({ orderedDebts, safeToPay });
  const result = allocateSafeToPay({ orderedDebts, safeToPay });
  expect(result.allocations[0].debt).toBe(b); expect(result.allocations[1].debt).toBe(a);
  expect(JSON.stringify({ orderedDebts, safeToPay })).toBe(before); expect(orderedDebts).toEqual([b, a]);
  expect(Object.isFrozen(orderedDebts)).toBe(false); expect(Object.isFrozen(safeToPay)).toBe(false);
  for (const owned of [result, result.allocations, ...result.allocations, ...result.allocations.map(a => a.amount),
    result.totalAllocated, result.remainingSafeToPay, result.protectionStartDate, result.protectionThroughDate]) {
    expect(Object.isFrozen(owned)).toBe(true); expect(Reflect.set(owned, 'extra', true)).toBe(false);
  }
  expect(allocateSafeToPay({ orderedDebts: Object.freeze(orderedDebts), safeToPay: Object.freeze(safeToPay) })).toEqual(result);
});
test('does not consult clock, randomness, sorting, or locale comparison', () => {
  const orderedDebts = [debt('b', 2), debt('a', 1)], safeToPay = capacity(2);
  const forbidden = () => { throw Error('Unexpected dependency'); };
  const spies = [jest.spyOn(globalThis, 'Date').mockImplementation(forbidden), jest.spyOn(Math, 'random').mockImplementation(forbidden),
    jest.spyOn(String.prototype, 'localeCompare').mockImplementation(forbidden)];
  try {
    const result = allocateSafeToPay({ orderedDebts, safeToPay });
    expect(result.allocations[0].debt).toBe(orderedDebts[0]); expect(result.allocations).toHaveLength(1);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  } finally { spies.forEach(spy => spy.mockRestore()); }
});
