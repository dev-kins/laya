import { calculateSafeToPay, type SafeToPayResult } from './calculateSafeToPay';
import { Debt, type DebtInput, type Interest } from './Debt';
import { FinancialDate } from './FinancialDate';
import { FinancialEvent } from './FinancialEvent';
import { debtId, incomeId } from './identifiers';
import { Money } from './Money';
import { orderDebtsForLayaAdaptive } from './orderDebtsForLayaAdaptive';
import { orderDebtsForStrategy } from './orderDebtsForStrategy';
import { projectCashFlow } from './projectCashFlow';
import { Recurrence } from './Recurrence';

const php = (units: number) => Money.fromMinorUnits(units, 'PHP');
const date = FinancialDate.parse;
const known = (basisPoints: number, period: 'monthly' | 'annual' = 'annual'): Interest => ({ kind: 'known', basisPoints, period });
const debt = (id: string, units: number, interest: Interest = { kind: 'unknown' }, patch: Partial<DebtInput> = {}) =>
  Debt.create({ id: debtId(id), name: 'Synthetic debt', balance: php(units), interest, ...patch });
const capacity = (units: number): SafeToPayResult => ({ amount: php(units),
  protectionStartDate: date('2026-10-02'), protectionThroughDate: date('2026-12-01') });
const clearable = 'clearable-within-safe-to-pay';
const remaining = 'remaining-avalanche-order';
const run = (debts: readonly Debt[], units: number) => orderDebtsForLayaAdaptive({ debts, safeToPay: capacity(units) });
const summary = (debts: readonly Debt[], units: number) => run(debts, units).orderedEntries.map(e => [e.debt.id, e.category]);
function permutations<T>(values: readonly T[]): T[][] {
  if (values.length === 0) return [[]];
  return values.flatMap((value, i) => permutations(values.filter((_, j) => i !== j)).map(rest => [value, ...rest]));
}

test('empty debts return a frozen empty ordering', () => {
  const result = run([], 0);
  expect(result).toEqual({ orderedEntries: [] });
  expect(Object.isFrozen(result)).toBe(true); expect(Object.isFrozen(result.orderedEntries)).toBe(true);
});
test.each([
  [249999, 250000, clearable], [250000, 250000, clearable], [250001, 250000, remaining],
  [1, 0, remaining], [0, 0, remaining], [0, 250000, remaining], [1, 1, clearable],
  [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER, clearable],
  [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER - 1, remaining],
])('single balance %s at capacity %s is %s', (balance, amount, category) => {
  const record = debt('single', balance); const result = run([record], amount);
  expect(result.orderedEntries).toEqual([{ debt: record, category }]);
  expect(result.orderedEntries[0].debt).toBe(record);
});
test('Adaptive differs explicitly from both Snowball and Avalanche', () => {
  const debts = [debt('A', 150000, known(500)), debt('B', 800000, known(2400)), debt('C', 400000, known(1800))];
  expect(orderDebtsForStrategy({ strategy: 'snowball', debts }).orderedDebts.map(d => d.id)).toEqual(['A', 'C', 'B']);
  expect(orderDebtsForStrategy({ strategy: 'avalanche', debts }).orderedDebts.map(d => d.id)).toEqual(['B', 'C', 'A']);
  expect(summary(debts, 300000)).toEqual([['A', clearable], ['B', remaining], ['C', remaining]]);
});
test('capacity is individual, not cumulative: both debts fit despite their combined balances', () => {
  expect(summary([debt('C', 500000, known(9999)), debt('B', 200000), debt('A', 150000)], 300000))
    .toEqual([['A', clearable], ['B', clearable], ['C', remaining]]);
});
test('multiple safe-maximum balances remain clearable without summation or overflow', () => {
  expect(summary([debt('b', Number.MAX_SAFE_INTEGER), debt('a', Number.MAX_SAFE_INTEGER)], Number.MAX_SAFE_INTEGER))
    .toEqual([['a', clearable], ['b', clearable]]);
});
test('Group A ignores interest, uses balance then code-unit ID, and always precedes Group B', () => {
  const records = [debt('a', 100, known(Number.MAX_SAFE_INTEGER, 'monthly')), debt('Z', 100),
    debt('small', 99, known(0)), debt('remaining', 0, known(Number.MAX_SAFE_INTEGER, 'monthly'))];
  for (const input of permutations(records)) {
    expect(summary(input, 100)).toEqual([['small', clearable], ['Z', clearable], ['a', clearable], ['remaining', remaining]]);
  }
});
test('zero capacity reproduces Avalanche with every debt, including zero balances, in Group B', () => {
  const records = [debt('unknown', 0), debt('known-zero', 100, known(0)), debt('annual', 50, known(1800)), debt('monthly', 200, known(200, 'monthly'))];
  for (const input of permutations(records)) {
    const result = run(input, 0);
    expect(result.orderedEntries.map(e => e.debt)).toEqual(orderDebtsForStrategy({ strategy: 'avalanche', debts: input }).orderedDebts);
    expect(result.orderedEntries.map(e => [e.debt.id, e.category])).toEqual([
      ['monthly', remaining], ['annual', remaining], ['known-zero', remaining], ['unknown', remaining],
    ]);
  }
});
test('Group B preserves normalized ties, balance/ID ties, known zero, and unknown ordering', () => {
  const records = [debt('b', 101, known(100, 'monthly')), debt('a', 101, known(1200)), debt('larger', 102, known(1200)),
    debt('known-zero', 0, known(0, 'monthly')), debt('unknown-b', 101), debt('unknown-a', 101), debt('unknown-zero', 0)];
  expect(summary(records, 100)).toEqual([['a', remaining], ['b', remaining], ['larger', remaining],
    ['known-zero', remaining], ['unknown-zero', remaining], ['unknown-a', remaining], ['unknown-b', remaining]]);
});
test('Group B preserves exact BigInt rate comparisons above the safe-number product range', () => {
  const max = Number.MAX_SAFE_INTEGER;
  expect(summary([debt('lower', 101, known(max - 1, 'monthly')), debt('higher', 102, known(max, 'monthly')),
    debt('annual', 0, known(max)), debt('fits', 1)], 100)).toEqual([
    ['fits', clearable], ['higher', remaining], ['lower', remaining], ['annual', remaining],
  ]);
});
test.each([0, 100])('names/providers and schedules do not influence either group at capacity %s', units => {
  const a = debt('a', 100, known(100), { name: 'Zulu', provider: 'Zulu', scheduledPayment: php(999),
    nextDueDate: date('2099-12-31'), recurrence: Recurrence.monthly(31) });
  const b = debt('b', 100, known(100), { name: 'Alpha', provider: 'Alpha', scheduledPayment: php(0),
    nextDueDate: date('2000-01-01'), recurrence: Recurrence.twiceMonthly(4, 19) });
  expect(summary([b, a], units)).toEqual([['a', units ? clearable : remaining], ['b', units ? clearable : remaining]]);
});
test.each(['same reference', 'different records across groups'])('duplicate IDs reject globally: %s', mode => {
  const first = debt('same', 100);
  expect(() => run([first, mode === 'same reference' ? first : debt('same', 200)], 100)).toThrow('Duplicate debt identity');
});
test.each([null, undefined, {}, { id: 'raw', balance: 100 }])('non-Debt input rejects %#', entry => {
  expect(() => run([entry as unknown as Debt], 100)).toThrow('Strategy entries must be Debt instances');
});
test('copies and freezes owned ordering/entries without changing inputs, references or window', () => {
  const a = debt('a', 100), b = debt('b', 200, known(200)); const debts = [b, a], safeToPay = capacity(100);
  const before = JSON.stringify({ debts, safeToPay });
  const result = orderDebtsForLayaAdaptive({ debts, safeToPay });
  expect(result.orderedEntries.map(e => e.debt)).toEqual([a, b]);
  expect(result.orderedEntries[0].debt).toBe(a); expect(result.orderedEntries[1].debt).toBe(b);
  expect(JSON.stringify({ debts, safeToPay })).toBe(before);
  expect(debts).toEqual([b, a]); expect(Object.isFrozen(debts)).toBe(false); expect(Object.isFrozen(safeToPay)).toBe(false);
  for (const owned of [result, result.orderedEntries, ...result.orderedEntries]) {
    expect(Object.isFrozen(owned)).toBe(true); expect(Reflect.set(owned, 'extra', true)).toBe(false);
  }
  expect(orderDebtsForLayaAdaptive({ debts: Object.freeze(debts), safeToPay: Object.freeze(safeToPay) })).toEqual(result);
});
test.each([['2026-10-02', '2026-10-02'], ['0001-01-01', '9999-12-31']])('accepts supplied window %s through %s without deriving a horizon', (start, through) => {
  const safeToPay = { amount: php(100), protectionStartDate: date(start), protectionThroughDate: date(through) };
  expect(orderDebtsForLayaAdaptive({ debts: [debt('a', 100)], safeToPay }).orderedEntries[0].category).toBe(clearable);
  expect(safeToPay.protectionStartDate.toString()).toBe(start); expect(safeToPay.protectionThroughDate.toString()).toBe(through);
});
test('rejects malformed Safe-to-Pay amounts and windows even with no debts', () => {
  const valid = capacity(100);
  const forged = (patch: object) => Object.assign(Object.create(Money.prototype), { currency: 'PHP', minorUnits: 1 }, patch) as Money;
  const invalid: unknown[] = [null, undefined, {},
    ...[null, php(-1), { minorUnits: 1, currency: 'PHP' }, forged({ currency: 'USD' }), forged({ minorUnits: 0.5 }),
      forged({ minorUnits: Number.MAX_SAFE_INTEGER + 1 }), forged({ minorUnits: NaN })].map(amount => ({ ...valid, amount })),
    { ...valid, protectionStartDate: '2026-10-02' }, { ...valid, protectionThroughDate: { year: 2026, month: 12, day: 1 } },
    { ...valid, protectionThroughDate: date('2026-10-01') },
  ];
  for (const safeToPay of invalid) expect(() => orderDebtsForLayaAdaptive({ debts: [], safeToPay: safeToPay as SafeToPayResult })).toThrow();
});
test('consumes a real SafeToPayResult directly: protected capacity, not starting or ending cash', () => {
  const projection = projectCashFlow({ startingBalance: php(500000), startDate: date('2026-10-02'), through: date('2026-12-01'),
    events: [FinancialEvent.create({ kind: 'debt-due', sourceId: debtId('due'), amount: php(200000),
      date: date('2026-10-03'), occurrenceKey: 'one-time' }),
    FinancialEvent.create({ kind: 'expected-income', sourceId: incomeId('income'), amount: php(400000),
      date: date('2026-10-04'), occurrenceKey: 'one-time' })] });
  const safeToPay = calculateSafeToPay(projection);
  expect(safeToPay.amount).toEqual(php(300000));
  expect(projection.endingBalance).toEqual(php(700000));
  const result = orderDebtsForLayaAdaptive({ debts: [debt('large', 400000), debt('fits', 300000)], safeToPay });
  expect(result.orderedEntries.map(e => [e.debt.id, e.category])).toEqual([['fits', clearable], ['large', remaining]]);
});
test('ordering performs no money addition/subtraction, clock reads, randomness or locale comparison', () => {
  const debts = [debt('b', 200000), debt('a', 150000)], safeToPay = capacity(300000);
  const forbidden = () => { throw Error('Unexpected dependency'); };
  const spies = [jest.spyOn(Money.prototype, 'add').mockImplementation(forbidden), jest.spyOn(Money.prototype, 'subtract').mockImplementation(forbidden),
    jest.spyOn(globalThis, 'Date').mockImplementation(forbidden), jest.spyOn(Math, 'random').mockImplementation(forbidden),
    jest.spyOn(String.prototype, 'localeCompare').mockImplementation(forbidden)];
  try {
    expect(orderDebtsForLayaAdaptive({ debts, safeToPay }).orderedEntries.map(e => e.category)).toEqual([clearable, clearable]);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  } finally { spies.forEach(spy => spy.mockRestore()); }
});
