import { calculateSafeToPay } from './calculateSafeToPay';
import { FinancialDate } from './FinancialDate';
import { FinancialEvent } from './FinancialEvent';
import { debtId, incomeId, obligationId, paymentId } from './identifiers';
import { Money } from './Money';
import { projectCashFlow, type CashFlowProjection } from './projectCashFlow';

const date = FinancialDate.parse;
const php = (units: number) => Money.fromMinorUnits(units, 'PHP');
function event(kind: FinancialEvent['kind'], units: number, day = '2026-10-03'): FinancialEvent {
  const common = { amount: php(units), date: date(day), occurrenceKey: 'synthetic' };
  switch (kind) {
    case 'expected-income': case 'received-income': return FinancialEvent.create({ ...common, kind, sourceId: incomeId('I') });
    case 'essential-due': return FinancialEvent.create({ ...common, kind, sourceId: obligationId('E') });
    case 'debt-due': return FinancialEvent.create({ ...common, kind, sourceId: debtId('D') });
    case 'debt-payment': return FinancialEvent.create({ ...common, kind, sourceId: paymentId('P') });
  }
}
function project(start: number, events: readonly FinancialEvent[] = []) {
  return projectCashFlow({ startingBalance: php(start), startDate: date('2026-10-02'), through: date('2026-10-10'), events });
}

test('mixed scenario retains the later positive minimum, not the ending balance', () => {
  const projection = project(1000000, [event('essential-due', 200000), event('debt-due', 300000, '2026-10-04'),
    event('expected-income', 500000, '2026-10-05'), event('essential-due', 100000, '2026-10-06')]);
  expect(projection.points.map(p => p.balanceAfter.minorUnits)).toEqual([800000, 500000, 1000000, 900000]);
  expect(calculateSafeToPay(projection).amount).toEqual(php(500000));
});
test.each([0, 1, 820000, Number.MAX_SAFE_INTEGER])('no events returns starting money %s exactly', starting => {
  expect(calculateSafeToPay(project(starting)).amount).toEqual(php(starting));
});
test.each([0, 400000])('future income cannot increase money removable now from %s', starting => {
  expect(calculateSafeToPay(project(starting, [event('expected-income', 500000)])).amount).toEqual(php(starting));
});
test.each([
  [100000, 80000, 20000], [100000, 100000, 0], [100000, 150000, 0],
  [2, 1, 1], [1, 2, 0], [0, Number.MAX_SAFE_INTEGER, 0], [Number.MAX_SAFE_INTEGER, 1, Number.MAX_SAFE_INTEGER - 1],
])('starting %s less obligation %s yields %s centavos', (starting, obligation, expected) => {
  expect(calculateSafeToPay(project(starting, [event('essential-due', obligation)])).amount).toEqual(php(expected));
});
test('decimal inputs keep every centavo without rounding', () => {
  const projection = projectCashFlow({ startingBalance: Money.parse('8200.50', 'PHP'), startDate: date('2026-10-02'), through: date('2026-10-10'),
    events: [event('essential-due', Money.parse('1600.49', 'PHP').minorUnits)] });
  expect(calculateSafeToPay(projection).amount).toEqual(Money.parse('6600.01', 'PHP'));
});
test('later recovery does not erase a negative same-day intermediate balance', () => {
  const projection = project(100000, [event('expected-income', 500000), event('debt-due', 150000)]);
  expect(projection.endingBalance).toEqual(php(450000));
  expect(calculateSafeToPay(projection).amount).toEqual(php(0));
});
test('expected/received and due/payment coexistence inherit upstream exclusions without reconciliation', () => {
  const projection = project(1000000, [event('expected-income', 450000), event('received-income', 450000),
    event('debt-due', 176400), event('debt-payment', 176400)]);
  expect(projection.points.map(p => p.balanceAfter.minorUnits)).toEqual([823600, 1273600]);
  expect(projection.excludedEvents.map(e => e.event.kind)).toEqual(['debt-payment', 'received-income']);
  expect(calculateSafeToPay(projection).amount).toEqual(php(823600));
});
test.each([['2026-10-02', '2026-10-02'], ['2026-10-02', '2026-10-03'], ['0001-01-01', '9999-12-31']])('inherits arbitrary window %s through %s', (start, through) => {
  const projection = projectCashFlow({ startingBalance: php(100), startDate: date(start), through: date(through), events: [] });
  expect(calculateSafeToPay(projection)).toEqual({ amount: php(100), protectionStartDate: date(start), protectionThroughDate: date(through) });
});
test('start-day and beyond-window obligations remain excluded, through-day obligation applies', () => {
  const projection = project(100000, [event('essential-due', 90000, '2026-10-02'),
    event('essential-due', 10000, '2026-10-10'), event('essential-due', 90000, '2026-10-11')]);
  expect(calculateSafeToPay(projection).amount).toEqual(php(90000));
});
test('removing the result keeps every balance nonnegative; one more centavo breaks the bound', () => {
  const projection = project(100000, [event('essential-due', 80000), event('expected-income', 200000)]);
  const { amount } = calculateSafeToPay(projection);
  const balances = [projection.start.balance, ...projection.points.map(p => p.balanceAfter)];
  expect(balances.map(balance => balance.subtract(amount).minorUnits)).toEqual([80000, 0, 200000]);
  expect(balances.some(balance => balance.subtract(amount.add(php(1))).compare(php(0)) < 0)).toBe(true);
});
test('result and owned values are frozen; repeated calls leave projection and points unchanged', () => {
  const projection = project(100000, [event('essential-due', 80000)]);
  const before = JSON.stringify(projection), points = [...projection.points];
  const result = calculateSafeToPay(projection);
  expect(calculateSafeToPay(projection)).toEqual(result);
  expect(JSON.stringify(projection)).toBe(before);
  projection.points.forEach((point, i) => expect(point).toBe(points[i]));
  for (const value of [result, result.amount, result.protectionStartDate, result.protectionThroughDate]) {
    expect(Object.isFrozen(value)).toBe(true); expect(Reflect.set(value, 'extra', true)).toBe(false);
  }
});
test('rejects malformed consumed values and obvious inconsistencies without validating all points', () => {
  const valid = project(100);
  const forged = (patch: object) => Object.assign(Object.create(Money.prototype), { minorUnits: 1, currency: 'PHP' }, patch) as Money;
  const invalid: unknown[] = [null, undefined, {}, { ...valid, start: null },
    { ...valid, through: '2026-10-10' }, { ...valid, through: date('2026-10-01') },
    { ...valid, start: { ...valid.start, balance: php(-1) } },
    { ...valid, start: { ...valid.start, date: { year: 2026, month: 10, day: 2 } } },
    ...[null, { minorUnits: 1, currency: 'PHP' }, forged({ currency: 'USD' }), forged({ minorUnits: 0.5 }),
      forged({ minorUnits: Number.MAX_SAFE_INTEGER + 1 }), forged({ minorUnits: Number.MIN_SAFE_INTEGER - 1 }),
      forged({ minorUnits: NaN }), php(101)].map(minimumProjectedBalance => ({ ...valid, minimumProjectedBalance })),
  ];
  for (const value of invalid) expect(() => calculateSafeToPay(value as CashFlowProjection)).toThrow();
});
test('does not inspect events, rerun projection, or consult clock/randomness', () => {
  const projection = project(100000, [event('essential-due', 80000)]);
  const forbidden = () => { throw Error('Unexpected dependency'); };
  const supplied = { ...projection };
  Object.defineProperties(supplied, { points: { get: forbidden }, excludedEvents: { get: forbidden } });
  const spies = [jest.spyOn(globalThis, 'Date').mockImplementation(forbidden), jest.spyOn(Math, 'random').mockImplementation(forbidden)];
  try { expect(calculateSafeToPay(supplied).amount).toEqual(php(20000)); }
  finally { spies.forEach(spy => spy.mockRestore()); }
});
