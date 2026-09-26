import { FinancialDate } from './FinancialDate';
import { compareFinancialEvents, FinancialEvent, type FinancialEventInput, sortFinancialEvents } from './FinancialEvent';
import { debtId, incomeId, obligationId, paymentId } from './identifiers';
import { Money } from './Money';
import { Recurrence } from './Recurrence';

const date = FinancialDate.parse('2026-10-19');
const money = Money.fromMinorUnits(10000, 'PHP');
const inputs = [
  { kind: 'essential-due', sourceId: obligationId('essential-1'), amount: money, date, occurrenceKey: 'once' },
  { kind: 'debt-due', sourceId: debtId('debt-1'), amount: money, date, occurrenceKey: 'once' },
  { kind: 'debt-payment', sourceId: paymentId('payment-1'), amount: money, date, occurrenceKey: 'once' },
  { kind: 'received-income', sourceId: incomeId('receipt-1'), amount: money, date, occurrenceKey: 'once' },
  { kind: 'expected-income', sourceId: incomeId('expected-1'), amount: money, date, occurrenceKey: 'once' },
] as const satisfies readonly FinancialEventInput[];

test.each(inputs)('$kind preserves explicit direction, positive amount, and source identity', (input) => {
  const event = FinancialEvent.create(input);
  expect(event.kind).toBe(input.kind);
  expect(event.sourceId).toBe(input.sourceId);
  expect(event.amount.minorUnits).toBe(10000);
  expect(event.amount.currency).toBe('PHP');
  expect(event.direction).toBe(input.kind.includes('income') ? 'inflow' : 'outflow');
  expect(event.id).toBe(FinancialEvent.create(input).id);
});

function permutations<T>(values: readonly T[]): T[][] {
  return values.length === 0 ? [[]] : values.flatMap((value, index) =>
    permutations(values.filter((_, i) => i !== index)).map((rest) => [value, ...rest]));
}
test('every permutation has the same conservative same-day ordering', () => {
  const ordered = inputs.map(FinancialEvent.create);
  for (const input of permutations(ordered)) {
    const before = [...input];
    expect(sortFinancialEvents(input)).toEqual(ordered);
    expect(input).toEqual(before);
  }
});
test('date precedes kind, then source and occurrence keys break ties without locale sorting', () => {
  const input = inputs[1];
  const a = FinancialEvent.create({ ...input, sourceId: debtId('A') });
  const b = FinancialEvent.create({ ...input, sourceId: debtId('a'), occurrenceKey: 'slot-1' });
  const c = FinancialEvent.create({ ...input, sourceId: debtId('a'), occurrenceKey: 'slot-2' });
  const earlier = FinancialEvent.create({ ...inputs[4], date: FinancialDate.parse('2026-10-18') });
  const later = FinancialEvent.create({ ...inputs[0], date: FinancialDate.parse('2026-10-20') });
  expect(sortFinancialEvents([later, c, b, a, earlier])).toEqual([earlier, a, b, c, later]);
  expect(compareFinancialEvents(a, a)).toBe(0);
  expect(Math.sign(compareFinancialEvents(a, b))).toBe(-Math.sign(compareFinancialEvents(b, a)));
});
test('same-date recurrence collisions remain distinct through caller-supplied slots', () => {
  const feb = FinancialDate.parse('2026-02-28');
  // Fixture assembly only: no production event expansion API is introduced.
  const events = Recurrence.twiceMonthly(30, 31).occurrences(feb, feb).map((occurrence) => FinancialEvent.create({
    kind: 'debt-due', sourceId: debtId('loan'), date: occurrence.date, amount: money, occurrenceKey: `requested-day-${occurrence.requestedDay}`,
  }));
  expect(sortFinancialEvents([...events].reverse()).map((event) => event.occurrenceKey)).toEqual(['requested-day-30', 'requested-day-31']);
  expect(events[0].id).not.toBe(events[1].id);
  expect(events.map((event) => event.date.toString())).toEqual(['2026-02-28', '2026-02-28']);
});
test('rejects duplicate identities instead of relying on insertion order or dropping a row', () => {
  const first = FinancialEvent.create(inputs[0]);
  const conflict = FinancialEvent.create({ ...inputs[0], amount: Money.fromMinorUnits(1, 'PHP') });
  expect(() => sortFinancialEvents([first, conflict])).toThrow('Duplicate');
});
test('identity safely distinguishes strings containing separators', () => {
  const a = FinancialEvent.create({ ...inputs[1], sourceId: debtId('a|b'), occurrenceKey: 'c' });
  const b = FinancialEvent.create({ ...inputs[1], sourceId: debtId('a'), occurrenceKey: 'b|c' });
  expect(a.id).not.toBe(b.id);
});
test.each(inputs)('$kind rejects negative and zero amounts, accepting positive boundaries', (input) => {
  expect(() => FinancialEvent.create({ ...input, amount: Money.fromMinorUnits(-1, 'PHP') })).toThrow();
  const zero = () => FinancialEvent.create({ ...input, amount: Money.zero('PHP') });
  expect(zero).toThrow('Financial event amount must be positive.');
  expect(FinancialEvent.create({ ...input, amount: Money.fromMinorUnits(1, 'PHP') }).amount.minorUnits).toBe(1);
  expect(FinancialEvent.create({ ...input, amount: Money.fromMinorUnits(Number.MAX_SAFE_INTEGER, 'PHP') }).amount.minorUnits).toBe(Number.MAX_SAFE_INTEGER);
});
test('rejects invalid kinds, empty slots, invalid dates and monetary substitutes', () => {
  expect(() => FinancialEvent.create({ ...inputs[0], kind: 'forecast' } as unknown as FinancialEventInput)).toThrow();
  expect(() => FinancialEvent.create({ ...inputs[0], occurrenceKey: ' ' })).toThrow();
  expect(() => FinancialEvent.create({ ...inputs[0], date: '2026-10-19' as unknown as FinancialDate })).toThrow();
  expect(() => FinancialEvent.create({ ...inputs[0], amount: { minorUnits: 1, currency: 'USD' } as unknown as Money })).toThrow();
});
test('freezes events, nested values, and sorted arrays', () => {
  const event = FinancialEvent.create(inputs[0]);
  expect(Reflect.set(event, 'direction', 'inflow')).toBe(false);
  expect(Reflect.set(event.amount, 'minorUnits', -1)).toBe(false);
  expect(Reflect.set(event.date, 'day', 1)).toBe(false);
  expect(Reflect.set(sortFinancialEvents([event]), '0', null)).toBe(false);
  expect(sortFinancialEvents([])).toEqual([]);
});
