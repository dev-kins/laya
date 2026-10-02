import { Debt, type DebtInput } from './Debt';
import { DebtPayment } from './DebtPayment';
import { EssentialObligation } from './EssentialObligation';
import { FinancialDate } from './FinancialDate';
import { FinancialEvent } from './FinancialEvent';
import { generateFinancialEvents, type GenerateFinancialEventsInput } from './generateFinancialEvents';
import { debtId, incomeId, obligationId, paymentId } from './identifiers';
import { Income } from './Income';
import { Money } from './Money';
import { Recurrence } from './Recurrence';

const date = FinancialDate.parse;
const php = (units: number) => Money.fromMinorUnits(units, 'PHP');
const income = (day = '2026-10-15', recurrence?: Recurrence, units = 450050, id = 'I') =>
  Income.create({ id: incomeId(id), name: 'Synthetic salary', amount: php(units), date: date(day), status: 'expected', recurrence });
const received = (day = '2026-10-15', units = 450050, id = 'R') =>
  Income.create({ id: incomeId(id), name: 'Synthetic salary', amount: php(units), date: date(day), status: 'received' });
const essential = (day = '2026-10-15', recurrence?: Recurrence, units = 149950, id = 'E') =>
  EssentialObligation.create({ id: obligationId(id), name: 'Synthetic expense', amount: php(units), date: date(day), recurrence });
const debt = (patch: Partial<DebtInput> = {}) => Debt.create({ id: debtId('D'), name: 'Synthetic debt', balance: php(50000),
  scheduledPayment: php(100000), nextDueDate: date('2026-10-15'), interest: { kind: 'unknown' }, ...patch });
const payment = (day = '2026-10-15', id = 'P') => DebtPayment.create({ id: paymentId(id), debtId: debtId('D'), amount: php(100000), date: date(day) });
function inputs(patch: Partial<GenerateFinancialEventsInput> = {}): GenerateFinancialEventsInput {
  return { from: date('2026-10-01'), through: date('2026-12-31'), debts: [], incomes: [], essentialObligations: [], debtPayments: [], ...patch };
}
const dates = (input: GenerateFinancialEventsInput) => generateFinancialEvents(input).map(event => event.date.toString());

describe('inclusive range and one-time facts', () => {
  test.each(['expected', 'received', 'essential', 'debt', 'payment'] as const)('%s includes both boundaries, excludes outside, and supports a single day', kind => {
    const make = (day: string): Partial<GenerateFinancialEventsInput> => {
      switch (kind) {
        case 'expected': return { incomes: [income(day)] };
        case 'received': return { incomes: [received(day)] };
        case 'essential': return { essentialObligations: [essential(day)] };
        case 'debt': return { debts: [debt({ nextDueDate: date(day) })] };
        case 'payment': return { debtPayments: [payment(day)] };
      }
    };
    for (const day of ['2026-10-01', '2026-12-31']) {
      expect(dates(inputs(make(day)))).toEqual([day]);
      expect(dates(inputs({ ...make(day), from: date(day), through: date(day) }))).toEqual([day]);
    }
    for (const day of ['2026-09-30', '2027-01-01']) expect(dates(inputs(make(day)))).toEqual([]);
  });
  test('reversed range rejects even with empty inputs', () => {
    expect(() => generateFinancialEvents(inputs({ from: date('2027-01-01') }))).toThrow('Range start must not be after its end');
  });
  test('requires actual valid FinancialDate boundaries', () => {
    for (const value of [undefined, '2026-10-01', { year: 2026, month: 10, day: 1 }]) {
      for (const field of ['from', 'through']) {
        expect(() => generateFinancialEvents(inputs({ [field]: value } as unknown as Partial<GenerateFinancialEventsInput>))).toThrow();
      }
    }
  });
  test('empty input returns a frozen empty result', () => {
    const result = generateFinancialEvents(inputs());
    expect(result).toEqual([]); expect(Object.isFrozen(result)).toBe(true);
  });
});

describe.each(['income', 'essential'] as const)('%s recurrence', kind => {
  function make(day: string, rule: Recurrence, units = 12345): Partial<GenerateFinancialEventsInput> {
    return kind === 'income' ? { incomes: [income(day, rule, units)] } : { essentialObligations: [essential(day, rule, units)] };
  }
  test('monthly occurrences never precede the anchor', () => {
    expect(dates(inputs({ ...make('2026-10-04', Recurrence.monthly(4)), from: date('2026-09-01'), through: date('2026-11-30') })))
      .toEqual(['2026-10-04', '2026-11-04']);
  });
  test('anchor is a lower bound, not an extra occurrence when it differs from the rule', () => {
    expect(dates(inputs(make('2026-10-10', Recurrence.monthly(15)))))
      .toEqual(['2026-10-15', '2026-11-15', '2026-12-15']);
    expect(dates(inputs(make('2026-10-20', Recurrence.monthly(15)))))
      .toEqual(['2026-11-15', '2026-12-15']);
  });
  test('twice-monthly resumes remaining slots at/after the anchor', () => {
    expect(dates(inputs(make('2026-10-19', Recurrence.twiceMonthly(4, 19)))))
      .toEqual(['2026-10-19', '2026-11-04', '2026-11-19', '2026-12-04', '2026-12-19']);
  });
  test('day 31 clamps across leap February and restores the requested day', () => {
    expect(dates(inputs({ ...make('2027-12-31', Recurrence.monthly(31)), from: date('2027-11-01'), through: date('2028-04-30') })))
      .toEqual(['2027-12-31', '2028-01-31', '2028-02-29', '2028-03-31', '2028-04-30']);
  });
  test.each(['2026-02-28', '2028-02-29'])('30/31 collisions on %s retain identity and exact amounts', day => {
    const result = generateFinancialEvents(inputs({ ...make('2026-01-01', Recurrence.twiceMonthly(30, 31)), from: date(day), through: date(day) }));
    expect(result.map(event => [event.date.toString(), event.occurrenceKey, event.amount.minorUnits]))
      .toEqual([[day, 'requested-day:30', 12345], [day, 'requested-day:31', 12345]]);
    expect(result[0].id).not.toBe(result[1].id);
  });
  test('anchor after range generates none', () => {
    expect(dates(inputs(make('2027-01-01', Recurrence.monthly(1))))).toEqual([]);
  });
  test('zero recurring values produce no events', () => {
    expect(dates(inputs(make('2026-10-01', Recurrence.twiceMonthly(4, 19), 0)))).toEqual([]);
  });
});

describe('debt cycle replacement', () => {
  test.each(['2026-10-10', '2026-10-15', '2026-10-20'])('authoritative %s replaces the whole month for monthly day 15', anchor => {
    const result = generateFinancialEvents(inputs({ from: date('2026-09-01'), debts: [debt({ nextDueDate: date(anchor), recurrence: Recurrence.monthly(15) })] }));
    expect(result.map(event => [event.date.toString(), event.occurrenceKey, event.amount.minorUnits]))
      .toEqual([[anchor, 'one-time', 100000], ['2026-11-15', 'requested-day:15', 100000], ['2026-12-15', 'requested-day:15', 100000]]);
  });
  test.each(['2026-01-30', '2026-01-31', '2028-01-30'])('day 31 resumes after %s with existing clamping', anchor => {
    const year = anchor.slice(0, 4); const feb = year === '2028' ? '29' : '28';
    expect(dates(inputs({ from: date(`${year}-01-01`), through: date(`${year}-03-31`),
      debts: [debt({ nextDueDate: date(anchor), recurrence: Recurrence.monthly(31) })] })))
      .toEqual([anchor, `${year}-02-${feb}`, `${year}-03-31`]);
  });
  test.each(['2026-10-04', '2026-10-10', '2026-10-19', '2026-10-25'])('twice-monthly uses only explicit %s in its cycle', anchor => {
    expect(dates(inputs({ debts: [debt({ nextDueDate: date(anchor), recurrence: Recurrence.twiceMonthly(4, 19) })] })))
      .toEqual([anchor, '2026-11-04', '2026-11-19', '2026-12-04', '2026-12-19']);
  });
  test('colliding slots are suppressed in the explicit month and both resume subsequently', () => {
    const result = generateFinancialEvents(inputs({ from: date('2026-02-01'), through: date('2026-04-30'),
      debts: [debt({ nextDueDate: date('2026-02-28'), recurrence: Recurrence.twiceMonthly(30, 31) })] }));
    expect(result.map(event => [event.date.toString(), event.occurrenceKey])).toEqual([
      ['2026-02-28', 'one-time'], ['2026-03-30', 'requested-day:30'], ['2026-03-31', 'requested-day:31'],
      ['2026-04-30', 'requested-day:30'], ['2026-04-30', 'requested-day:31'],
    ]);
  });
  test.each([
    ['2026-10-11', '2026-10-31', []],
    ['2026-10-11', '2026-12-31', ['2026-11-15', '2026-12-15']],
    ['2027-02-16', '2027-04-15', ['2027-03-15', '2027-04-15']],
  ] as const)('range %s through %s retains original cycle replacement', (from, through, expected) => {
    expect(dates(inputs({ from: date(from), through: date(through),
      debts: [debt({ nextDueDate: date('2026-10-10'), recurrence: Recurrence.monthly(15) })] }))).toEqual(expected);
  });
  test('twice-monthly late range resumes all in-range slots without a new explicit event', () => {
    expect(dates(inputs({ from: date('2027-02-05'), through: date('2027-03-19'),
      debts: [debt({ nextDueDate: date('2026-10-19'), recurrence: Recurrence.twiceMonthly(4, 19) })] })))
      .toEqual(['2027-02-19', '2027-03-04', '2027-03-19']);
  });
  test.each([
    { scheduledPayment: undefined }, { nextDueDate: undefined },
    { scheduledPayment: undefined, nextDueDate: undefined }, { scheduledPayment: php(0) },
  ])('missing or zero scheduling input produces no due events %#', patch => {
    expect(dates(inputs({ debts: [debt({ recurrence: Recurrence.monthly(15), ...patch })] }))).toEqual([]);
  });
  test.each([0, 50000])('balance %s never caps/suppresses dues and interest does not affect them', balance => {
    for (const interest of [{ kind: 'unknown' }, { kind: 'known', basisPoints: 1200, period: 'monthly' },
      { kind: 'known', basisPoints: 0, period: 'annual' }] as const) {
      const source = debt({ balance: php(balance), interest, recurrence: Recurrence.monthly(15) });
      const result = generateFinancialEvents(inputs({ debts: [source] }));
      expect(result.map(event => event.amount.minorUnits)).toEqual([100000, 100000, 100000]);
      expect(source.balance.minorUnits).toBe(balance);
    }
  });
});

test('zero one-time entities are filtered without rejecting valid sources', () => {
  expect(generateFinancialEvents(inputs({ incomes: [income(undefined, undefined, 0), received(undefined, 0)],
    essentialObligations: [essential(undefined, undefined, 0)], debts: [debt({ scheduledPayment: php(0) })] }))).toEqual([]);
});

test('independent expected/received and due/payment coexist with established same-day ordering', () => {
  const source = debt();
  const result = generateFinancialEvents(inputs({ incomes: [income(), received()], debts: [source],
    essentialObligations: [essential()], debtPayments: [payment()] }));
  expect(result.map(event => [event.kind, event.sourceId, event.amount.minorUnits, event.direction])).toEqual([
    ['essential-due', 'E', 149950, 'outflow'], ['debt-due', 'D', 100000, 'outflow'], ['debt-payment', 'P', 100000, 'outflow'],
    ['received-income', 'R', 450050, 'inflow'], ['expected-income', 'I', 450050, 'inflow'],
  ]);
  expect(source.balance.minorUnits).toBe(50000);
});

test('historical one-time events are not rolled forward; recurring obligations continue normally', () => {
  expect(dates(inputs({ from: date('2026-09-28'), through: date('2026-10-31'), incomes: [received('2026-09-19')],
    debts: [debt({ nextDueDate: date('2026-09-19') })], debtPayments: [payment('2026-09-19')],
    essentialObligations: [essential('2026-09-19'), essential('2026-09-19', Recurrence.monthly(19), 149950, 'recurring')] })))
    .toEqual(['2026-10-19']);
});

test.each(['0001-01-01', '9999-12-31'])('all kinds support calendar boundary %s without overflow', day => {
  const rule = Recurrence.monthly(date(day).day);
  const result = generateFinancialEvents(inputs({ from: date(day), through: date(day), incomes: [income(day, rule), received(day)],
    essentialObligations: [essential(day, rule)], debts: [debt({ nextDueDate: date(day), recurrence: rule })], debtPayments: [payment(day)] }));
  expect(result).toHaveLength(5);
  expect(result.every(event => event.date.toString() === day)).toBe(true);
});

test('debt recurrence crosses December and reaches final supported month safely', () => {
  expect(dates(inputs({ from: date('9998-12-01'), through: date('9999-12-31'),
    debts: [debt({ nextDueDate: date('9998-12-30'), recurrence: Recurrence.monthly(31) })] })))
    .toEqual(['9998-12-30', '9999-01-31', '9999-02-28', '9999-03-31', '9999-04-30', '9999-05-31',
      '9999-06-30', '9999-07-31', '9999-08-31', '9999-09-30', '9999-10-31', '9999-11-30', '9999-12-31']);
});

test('all event kinds retain safe-integer maximum without summing amounts', () => {
  const units = Number.MAX_SAFE_INTEGER;
  const result = generateFinancialEvents(inputs({ incomes: [income(undefined, undefined, units), received(undefined, units)],
    essentialObligations: [essential(undefined, undefined, units)], debts: [debt({ scheduledPayment: php(units) })],
    debtPayments: [DebtPayment.create({ ...payment(), amount: php(units) })] }));
  expect(result.map(event => [event.amount.minorUnits, event.amount.currency])).toEqual(Array.from({ length: 5 }, () => [units, 'PHP']));
});

test('input permutations, repeated calls and overlapping ranges preserve IDs/order without mutation', () => {
  const rule = Recurrence.twiceMonthly(30, 31);
  const source = inputs({ from: date('2026-02-01'), through: date('2026-03-31'),
    incomes: [income('2026-01-01', rule, 12345, 'a'), income('2026-01-01', rule, 12345, 'A'), received('2026-02-28')],
    debts: [debt({ nextDueDate: date('2026-01-10'), recurrence: rule }), debt({ id: debtId('A'), nextDueDate: date('2026-03-01') })],
    essentialObligations: [essential('2026-01-01', rule), essential('2026-03-01', undefined, 100, 'A')],
    debtPayments: [payment('2026-02-28', 'z'), payment('2026-02-28', 'A')] });
  const before = JSON.stringify(source);
  const result = generateFinancialEvents(source);
  const reversed = { ...source, incomes: [...source.incomes].reverse(), debts: [...source.debts].reverse(),
    essentialObligations: [...source.essentialObligations].reverse(), debtPayments: [...source.debtPayments].reverse() };
  expect(generateFinancialEvents(reversed)).toEqual(result);
  expect(generateFinancialEvents(source)).toEqual(result);
  expect(generateFinancialEvents({ ...source, from: date('2026-02-28'), through: date('2026-02-28') }))
    .toEqual(result.filter(event => event.date.toString() === '2026-02-28'));
  expect(result.filter(event => event.kind === 'expected-income' && event.date.toString() === '2026-02-28'))
    .toMatchObject([{ sourceId: 'A', occurrenceKey: 'requested-day:30' }, { sourceId: 'A', occurrenceKey: 'requested-day:31' },
      { sourceId: 'a', occurrenceKey: 'requested-day:30' }, { sourceId: 'a', occurrenceKey: 'requested-day:31' }]);
  expect(JSON.stringify(source)).toBe(before);
  expect(Object.isFrozen(source.incomes)).toBe(false);
  expect(Reflect.set(result, '0', null)).toBe(false);
  for (const event of result) {
    expect(event).toBeInstanceOf(FinancialEvent);
    expect(Object.isFrozen(event)).toBe(true);
    expect(Object.isFrozen(event.date)).toBe(true);
    expect(Object.isFrozen(event.amount)).toBe(true);
    expect(event.id).toBe(JSON.stringify([event.kind, event.sourceId, event.date.toString(), event.occurrenceKey]));
  }
});

test.each(['incomes', 'essentialObligations', 'debts', 'debtPayments'] as const)('duplicate generated identity in %s rejects', field => {
  const source = inputs({ incomes: [income()], essentialObligations: [essential()], debts: [debt()], debtPayments: [payment()] });
  const duplicated = { ...source, [field]: [...source[field], ...source[field]] };
  expect(() => generateFinancialEvents(duplicated)).toThrow('Duplicate financial event identity');
});

test('conflicting amounts with the same generated identity also reject', () => {
  expect(() => generateFinancialEvents(inputs({ incomes: [income(), income(undefined, undefined, 1)] }))).toThrow('Duplicate');
});

test('generation does not consult clocks, timezones, randomness, or monetary arithmetic', () => {
  const source = inputs({ incomes: [income('2026-10-04', Recurrence.monthly(4)), received()],
    essentialObligations: [essential('2026-10-01', Recurrence.twiceMonthly(30, 31))],
    debts: [debt({ recurrence: Recurrence.monthly(15) })], debtPayments: [payment()] });
  const forbidden = () => { throw new Error('Forbidden external input or arithmetic'); };
  const spies = [jest.spyOn(Date, 'now').mockImplementation(forbidden), jest.spyOn(globalThis, 'Date').mockImplementation(forbidden),
    jest.spyOn(Intl, 'DateTimeFormat').mockImplementation(forbidden), jest.spyOn(Math, 'random').mockImplementation(forbidden),
    jest.spyOn(Money.prototype, 'add').mockImplementation(forbidden), jest.spyOn(Money.prototype, 'subtract').mockImplementation(forbidden)];
  try {
    expect(generateFinancialEvents(source)).toHaveLength(14);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  } finally { for (const spy of [...spies].reverse()) spy.mockRestore(); }
});
