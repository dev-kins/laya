import { Debt } from './Debt';
import { DebtPayment } from './DebtPayment';
import { FinancialDate } from './FinancialDate';
import { FinancialEvent } from './FinancialEvent';
import { generateFinancialEvents } from './generateFinancialEvents';
import { debtId, incomeId, obligationId, paymentId } from './identifiers';
import { Income } from './Income';
import { Money } from './Money';
import { projectCashFlow, type ProjectCashFlowInput } from './projectCashFlow';
import { Recurrence } from './Recurrence';

const date = FinancialDate.parse;
const php = (units: number) => Money.fromMinorUnits(units, 'PHP');
const kinds = ['expected-income', 'essential-due', 'debt-due', 'received-income', 'debt-payment'] as const;
function event(kind: FinancialEvent['kind'], units = 100, day = '2026-10-03', id = 'synthetic', occurrenceKey = 'one-time'): FinancialEvent {
  const common = { amount: php(units), date: date(day), occurrenceKey };
  switch (kind) {
    case 'expected-income': case 'received-income': return FinancialEvent.create({ ...common, kind, sourceId: incomeId(id) });
    case 'essential-due': return FinancialEvent.create({ ...common, kind, sourceId: obligationId(id) });
    case 'debt-due': return FinancialEvent.create({ ...common, kind, sourceId: debtId(id) });
    case 'debt-payment': return FinancialEvent.create({ ...common, kind, sourceId: paymentId(id) });
  }
}
function input(patch: Partial<ProjectCashFlowInput> = {}): ProjectCashFlowInput {
  return { startingBalance: php(100000), startDate: date('2026-10-02'), through: date('2026-10-31'), events: [], ...patch };
}

test.each([0, 1, 820050, Number.MAX_SAFE_INTEGER])('empty scenario retains starting amount %s and date as minimum', units => {
  const result = projectCashFlow(input({ startingBalance: php(units) }));
  expect(result.start).toEqual({ date: date('2026-10-02'), balance: php(units) });
  expect(result.through).toEqual(date('2026-10-31'));
  expect(result.points).toEqual([]); expect(result.excludedEvents).toEqual([]);
  expect(result.endingBalance).toEqual(php(units));
  expect(result.minimumProjectedBalance).toEqual(php(units));
  expect(result.minimumBalanceDate).toEqual(date('2026-10-02'));
});

test.each(kinds)('%s obeys exclusive start/inclusive end and auditable exclusion precedence', kind => {
  const days = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-31', '2026-11-01'];
  const events = days.map(day => event(kind, 100, day));
  const result = projectCashFlow(input({ events: [...events].reverse() }));
  const actual = kind === 'received-income' || kind === 'debt-payment';
  expect(result.points.map(point => point.event.date.toString())).toEqual(actual ? [] : ['2026-10-03', '2026-10-31']);
  expect(result.points.map(point => point.balanceAfter.minorUnits)).toEqual(actual ? [] :
    kind === 'expected-income' ? [100100, 100200] : [99900, 99800]);
  expect(result.endingBalance.minorUnits).toBe(actual ? 100000 : kind === 'expected-income' ? 100200 : 99800);
  expect(result.excludedEvents.map(item => [item.event.date.toString(), item.reason])).toEqual(actual ? [
    ['2026-10-01', 'outside-window'], ['2026-10-02', 'outside-window'], ['2026-10-03', 'actual-event'],
    ['2026-10-31', 'actual-event'], ['2026-11-01', 'outside-window'],
  ] : [['2026-10-01', 'outside-window'], ['2026-10-02', 'outside-window'], ['2026-11-01', 'outside-window']]);
});

test('equal start/end has no participating events, including on that date', () => {
  const result = projectCashFlow(input({ through: date('2026-10-02'), events: kinds.map(kind => event(kind, 100, '2026-10-02')) }));
  expect(result.points).toEqual([]);
  expect(result.excludedEvents).toHaveLength(5);
  expect(result.excludedEvents.every(item => item.reason === 'outside-window')).toBe(true);
  expect(result.endingBalance).toEqual(php(100000));
  expect(result.minimumProjectedBalance).toEqual(php(100000));
  expect(result.minimumBalanceDate).toEqual(date('2026-10-02'));
});

test('specified snapshot example excludes start-day expense and keeps exact balances', () => {
  const result = projectCashFlow(input({ startingBalance: php(820000), events: [
    event('essential-due', 50000, '2026-10-02'), event('essential-due', 160000), event('expected-income', 450000, '2026-10-04'),
  ] }));
  expect(result.points.map(point => point.balanceAfter.minorUnits)).toEqual([660000, 1110000]);
  expect(result.endingBalance).toEqual(php(1110000));
  expect(result.minimumProjectedBalance).toEqual(php(660000));
  expect(result.minimumBalanceDate).toEqual(date('2026-10-03'));
});

test('reversed range rejects without events', () => {
  expect(() => projectCashFlow(input({ through: date('2026-10-01') }))).toThrow('Projection start must not be after its end');
});

test.each(['startDate', 'through'] as const)('%s must be a valid FinancialDate', field => {
  const forged = Object.assign(Object.create(FinancialDate.prototype), { year: 10000, month: 1, day: 1 }) as FinancialDate;
  for (const value of [undefined, '2026-10-02', { year: 2026, month: 10, day: 2 }, forged]) {
    expect(() => projectCashFlow(input({ [field]: value } as unknown as Partial<ProjectCashFlowInput>))).toThrow();
  }
});

test('negative starting balance, raw substitutes, invalid currency and unsafe Money reject', () => {
  const forged = (patch: object) => Object.assign(Object.create(Money.prototype), { minorUnits: 1, currency: 'PHP' }, patch) as Money;
  for (const startingBalance of [php(-1), php(Number.MIN_SAFE_INTEGER), { minorUnits: 1, currency: 'PHP' } as Money,
    forged({ minorUnits: Number.MAX_SAFE_INTEGER + 1 }), forged({ minorUnits: 0.5 }), forged({ currency: 'USD' })]) {
    expect(() => projectCashFlow(input({ startingBalance }))).toThrow();
  }
});

test.each(['essential-due', 'debt-due'] as const)('%s precedes same-day expected income and retains intermediate minimum', kind => {
  const result = projectCashFlow(input({ events: [event('expected-income', 200000), event(kind, 80000)] }));
  expect(result.points.map(point => point.balanceAfter.minorUnits)).toEqual([20000, 220000]);
  expect(result.minimumProjectedBalance).toEqual(php(20000));
  expect(result.minimumBalanceDate).toEqual(date('2026-10-03'));
});

test('multiple outflows preserve kind, code-unit source, and occurrence order', () => {
  const ordered = [event('essential-due', 10000, undefined, 'A'),
    event('essential-due', 20000, undefined, 'a', 'slot-1'), event('essential-due', 30000, undefined, 'a', 'slot-2'),
    event('debt-due', 50000), event('expected-income', 200000)];
  const result = projectCashFlow(input({ events: [...ordered].reverse() }));
  expect(result.points.map(point => point.event)).toEqual(ordered);
  expect(result.points.map(point => point.balanceAfter.minorUnits)).toEqual([90000, 70000, 40000, -10000, 190000]);
  expect(result.minimumProjectedBalance).toEqual(php(-10000));
});

test('zero, one-centavo shortfall, multiple negative points and recovery are retained', () => {
  const result = projectCashFlow(input({ startingBalance: php(50000), events: [
    event('essential-due', 50000, '2026-10-03'), event('essential-due', 1, '2026-10-04'),
    event('debt-due', 29999, '2026-10-05'), event('expected-income', 40000, '2026-10-06'),
  ] }));
  expect(result.points.map(point => point.balanceAfter.minorUnits)).toEqual([0, -1, -30000, 10000]);
  expect(result.endingBalance).toEqual(php(10000));
  expect(result.minimumProjectedBalance).toEqual(php(-30000));
  expect(result.minimumBalanceDate).toEqual(date('2026-10-05'));
});

test('a starting minimum wins a later tie', () => {
  const result = projectCashFlow(input({ events: [event('expected-income', 10000), event('debt-due', 10000, '2026-10-04')] }));
  expect(result.minimumProjectedBalance).toEqual(php(100000));
  expect(result.minimumBalanceDate).toEqual(date('2026-10-02'));
});

test('first occurrence wins equal later minima, including same-day recurrence', () => {
  const result = projectCashFlow(input({ events: [event('essential-due', 80000), event('expected-income', 200000),
    event('debt-due', 200000, '2026-10-04'), event('expected-income', 200000, '2026-10-04'),
    event('debt-due', 200000, '2026-10-05')] }));
  expect(result.points.map(point => point.balanceAfter.minorUnits)).toEqual([20000, 220000, 20000, 220000, 20000]);
  expect(result.minimumProjectedBalance).toEqual(php(20000));
  expect(result.minimumBalanceDate).toEqual(date('2026-10-03'));
});

test('actuals-only input neither changes balances nor creates points', () => {
  const result = projectCashFlow(input({ events: [event('received-income', Number.MAX_SAFE_INTEGER), event('debt-payment', Number.MAX_SAFE_INTEGER)] }));
  expect(result.points).toEqual([]);
  expect(result.excludedEvents.map(item => item.event.kind)).toEqual(['debt-payment', 'received-income']);
  expect(result.endingBalance).toEqual(php(100000));
  expect(result.minimumProjectedBalance).toEqual(php(100000));
  expect(result.minimumBalanceDate).toEqual(date('2026-10-02'));
});

test('matching and unrelated actuals never satisfy or cancel forecasts', () => {
  const forecasts = [event('expected-income', 450000), event('debt-due', 176400)];
  const actuals = [event('received-income', 450000), event('debt-payment', 176400),
    event('received-income', 1, '2026-10-04', 'unrelated'), event('debt-payment', 1, '2026-10-05', 'unrelated')];
  const result = projectCashFlow(input({ events: [...actuals, ...forecasts] }));
  expect(result.points).toEqual(projectCashFlow(input({ events: forecasts })).points);
  expect(result.points.map(point => point.balanceAfter.minorUnits)).toEqual([-76400, 373600]);
  expect(result.excludedEvents).toHaveLength(4);
  expect(result.excludedEvents.every(item => item.reason === 'actual-event')).toBe(true);
});

test('one-centavo arithmetic remains exact from zero', () => {
  const result = projectCashFlow(input({ startingBalance: php(0), events: [event('expected-income', 1), event('debt-due', 1)] }));
  expect(result.points.map(point => point.balanceAfter.minorUnits)).toEqual([-1, 0]);
  expect(result.minimumProjectedBalance).toEqual(php(-1));
});

test('both safe-integer endpoints are reachable exactly', () => {
  const result = projectCashFlow(input({ startingBalance: php(0), events: [
    event('expected-income', Number.MAX_SAFE_INTEGER), event('debt-due', Number.MAX_SAFE_INTEGER, '2026-10-04'),
    event('essential-due', Number.MAX_SAFE_INTEGER, '2026-10-05'),
  ] }));
  expect(result.points.map(point => point.balanceAfter.minorUnits)).toEqual([Number.MAX_SAFE_INTEGER, 0, Number.MIN_SAFE_INTEGER]);
  expect(result.minimumProjectedBalance).toEqual(php(Number.MIN_SAFE_INTEGER));
  expect(result.minimumBalanceDate).toEqual(date('2026-10-05'));
});

test('positive overflow rejects even if a later expense would restore a valid balance', () => {
  expect(() => projectCashFlow(input({ startingBalance: php(Number.MAX_SAFE_INTEGER), events: [
    event('expected-income', 1), event('debt-due', 1, '2026-10-04'),
  ] }))).toThrow('Money exceeds the safe-integer range');
});

test('negative intermediate overflow rejects even if same-day income would restore balance', () => {
  expect(() => projectCashFlow(input({ startingBalance: php(0), events: [
    event('expected-income', 1), event('debt-due', 1), event('essential-due', Number.MAX_SAFE_INTEGER),
  ] }))).toThrow('Money exceeds the safe-integer range');
});

test.each(kinds)('duplicates of %s reject even if excluded from the window or arithmetic', kind => {
  for (const day of ['2026-10-01', '2026-10-02', '2026-10-03', '2026-11-01']) {
    const first = event(kind, 100, day);
    expect(() => projectCashFlow(input({ events: [first, first] }))).toThrow('Duplicate financial event identity');
    expect(() => projectCashFlow(input({ events: [first, event(kind, 200, day)] }))).toThrow('Duplicate financial event identity');
  }
});

test('repeated, reversed and rotated inputs yield identical deeply frozen results', () => {
  const events = [event('expected-income'), event('essential-due'), event('received-income'), event('debt-payment'),
    event('debt-due'), event('expected-income', 1, '2026-10-02')];
  const source = input({ events }); const before = JSON.stringify(source);
  const result = projectCashFlow(source);
  expect(projectCashFlow(source)).toEqual(result);
  expect(projectCashFlow({ ...source, events: [...events].reverse() })).toEqual(result);
  for (let offset = 1; offset < events.length; offset++) {
    expect(projectCashFlow({ ...source, events: [...events.slice(offset), ...events.slice(0, offset)] })).toEqual(result);
  }
  expect(JSON.stringify(source)).toBe(before);
  expect(Object.isFrozen(events)).toBe(false);
  for (const value of [result, result.start, result.start.balance, result.start.date, result.through, result.points,
    result.excludedEvents, result.endingBalance, result.minimumProjectedBalance, result.minimumBalanceDate,
    ...result.points, ...result.excludedEvents, ...events, ...events.map(item => item.amount), ...events.map(item => item.date)]) {
    expect(Object.isFrozen(value)).toBe(true);
    expect(Reflect.set(value, 'extra', 'mutation')).toBe(false);
  }
});

test.each([['0001-01-01', '0001-01-02'], ['9999-12-30', '9999-12-31']])('calendar bounds %s through %s need no date arithmetic', (start, end) => {
  const result = projectCashFlow(input({ startDate: date(start), through: date(end), events: [event('expected-income', 1, start), event('debt-due', 1, end)] }));
  expect(result.points.map(point => point.balanceAfter.minorUnits)).toEqual([99999]);
  expect(result.minimumBalanceDate).toEqual(date(end));
});

test('Task 017 composes externally while preserving cycle replacement and clamped collisions', () => {
  const events = generateFinancialEvents({ from: date('2026-01-01'), through: date('2026-02-28'),
    debts: [Debt.create({ id: debtId('D'), name: 'Synthetic loan', balance: php(100), scheduledPayment: php(20000),
      nextDueDate: date('2026-01-10'), recurrence: Recurrence.twiceMonthly(30, 31), interest: { kind: 'unknown' } })],
    incomes: [Income.create({ id: incomeId('I'), name: 'Synthetic income', amount: php(50000), date: date('2026-02-28'), status: 'expected' }),
      Income.create({ id: incomeId('R'), name: 'Synthetic income', amount: php(50000), date: date('2026-02-28'), status: 'received' })],
    essentialObligations: [], debtPayments: [DebtPayment.create({ id: paymentId('P'), debtId: debtId('D'), amount: php(20000), date: date('2026-02-28') })],
  });
  const result = projectCashFlow(input({ startingBalance: php(30000), startDate: date('2026-01-10'), through: date('2026-02-28'), events }));
  expect(result.points.map(point => [point.event.kind, point.event.occurrenceKey, point.balanceAfter.minorUnits])).toEqual([
    ['debt-due', 'requested-day:30', 10000], ['debt-due', 'requested-day:31', -10000], ['expected-income', 'one-time', 40000],
  ]);
  expect(result.excludedEvents.map(item => [item.event.kind, item.reason])).toEqual([
    ['debt-due', 'outside-window'], ['debt-payment', 'actual-event'], ['received-income', 'actual-event'],
  ]);
});

test('projection uses no clock, timezone or randomness', () => {
  const source = input({ events: [event('essential-due', 80000), event('expected-income', 200000)] });
  const forbidden = () => { throw new Error('External input forbidden'); };
  const spies = [jest.spyOn(Date, 'now').mockImplementation(forbidden), jest.spyOn(globalThis, 'Date').mockImplementation(forbidden),
    jest.spyOn(Intl, 'DateTimeFormat').mockImplementation(forbidden), jest.spyOn(Math, 'random').mockImplementation(forbidden)];
  try {
    expect(projectCashFlow(source).endingBalance).toEqual(php(220000));
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  } finally { for (const spy of [...spies].reverse()) spy.mockRestore(); }
});
