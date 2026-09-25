import { FinancialDate } from './FinancialDate';
import { Recurrence } from './Recurrence';

const date = FinancialDate.parse;
const dates = (rule: Recurrence, from: string, through: string) =>
  rule.occurrences(date(from), date(through)).map((item) => [item.date.toString(), item.requestedDay]);

describe('monthly recurrence', () => {
  test('includes both boundaries', () => {
    expect(dates(Recurrence.monthly(10), '2026-09-10', '2026-10-10')).toEqual([
      ['2026-09-10', 10], ['2026-10-10', 10],
    ]);
  });

  test.each([
    [28, '2026-02-01', '2026-02-28', '2026-02-28'],
    [29, '2026-02-01', '2026-02-28', '2026-02-28'],
    [29, '2028-02-01', '2028-02-29', '2028-02-29'],
    [30, '2026-02-01', '2026-02-28', '2026-02-28'],
    [31, '2026-02-01', '2026-02-28', '2026-02-28'],
    [31, '2028-02-01', '2028-02-29', '2028-02-29'],
    [31, '2026-04-01', '2026-04-30', '2026-04-30'],
  ])('clamps requested day %s in %s', (day, from, through, expected) => {
    expect(dates(Recurrence.monthly(day), from, through)).toEqual([[expected, day]]);
  });

  test('preserves day 31 after February and across a year boundary', () => {
    expect(dates(Recurrence.monthly(31), '2025-12-01', '2026-04-30')).toEqual([
      ['2025-12-31', 31], ['2026-01-31', 31], ['2026-02-28', 31],
      ['2026-03-31', 31], ['2026-04-30', 31],
    ]);
  });

  test('returns no occurrence outside the inclusive range', () => {
    expect(dates(Recurrence.monthly(10), '2026-09-11', '2026-10-09')).toEqual([]);
  });

  test('supports a one-day range', () => {
    expect(dates(Recurrence.monthly(10), '2026-09-10', '2026-09-10')).toEqual([['2026-09-10', 10]]);
  });
});

describe('twice-monthly recurrence', () => {
  test('normalizes requested days and crosses month/year boundaries', () => {
    const rule = Recurrence.twiceMonthly(19, 4);
    expect(rule.kind).toBe('twice-monthly');
    expect(rule.requestedDays).toEqual([4, 19]);
    expect(dates(rule, '2026-12-01', '2027-01-31')).toEqual([
      ['2026-12-04', 4], ['2026-12-19', 19], ['2027-01-04', 4], ['2027-01-19', 19],
    ]);
  });

  test.each(['2026-02-28', '2028-02-29'])(
    'preserves both colliding occurrences on %s', (day) => {
      expect(dates(Recurrence.twiceMonthly(31, 30), day, day)).toEqual([[day, 30], [day, 31]]);
    },
  );

  test.each([
    ['2026-09-04', '2026-09-18', '2026-09-04', 4],
    ['2026-09-05', '2026-09-19', '2026-09-19', 19],
  ])('includes just one slot for %s through %s', (from, through, expected, day) => {
    expect(dates(Recurrence.twiceMonthly(4, 19), from, through)).toEqual([[expected, day]]);
  });

  test('does not retain a clamp in subsequent months', () => {
    expect(dates(Recurrence.twiceMonthly(30, 31), '2026-02-01', '2026-03-31')).toEqual([
      ['2026-02-28', 30], ['2026-02-28', 31], ['2026-03-30', 30], ['2026-03-31', 31],
    ]);
  });
});

describe('validation and immutability', () => {
  test.each([0, 32, 1.5, NaN, Infinity, -Infinity, '10', null, undefined])('rejects invalid requested day %s', (day) => {
    expect(() => Recurrence.monthly(day)).toThrow(RangeError);
    expect(() => Recurrence.twiceMonthly(day, 19)).toThrow(RangeError);
    expect(() => Recurrence.twiceMonthly(4, day)).toThrow(RangeError);
  });

  test('rejects duplicate requested days', () => {
    expect(() => Recurrence.twiceMonthly(4, 4)).toThrow('distinct');
  });

  test('rejects reversed ranges', () => {
    expect(() => Recurrence.monthly(10).occurrences(date('2026-10-01'), date('2026-09-01')))
      .toThrow('Range start must not be after its end');
  });

  test('revalidates caller-provided range boundaries', () => {
    const invalid = { year: 10000, month: 1, day: 1 } as FinancialDate;
    const valid = date('2026-09-01');
    expect(() => Recurrence.monthly(10).occurrences(invalid, valid)).toThrow(RangeError);
    expect(() => Recurrence.monthly(10).occurrences(valid, invalid)).toThrow(RangeError);
  });

  test('supports lower and upper calendar bounds without overflow', () => {
    expect(dates(Recurrence.monthly(1), '0001-01-01', '0001-01-01')).toEqual([['0001-01-01', 1]]);
    expect(dates(Recurrence.monthly(31), '9999-12-31', '9999-12-31')).toEqual([['9999-12-31', 31]]);
  });

  test('freezes schedules, requested days, occurrences, and output arrays', () => {
    const rule = Recurrence.monthly(10);
    const occurrences = rule.occurrences(date('2026-09-01'), date('2026-09-30'));
    expect(rule.kind).toBe('monthly');
    expect(Reflect.set(rule, 'kind', 'weekly')).toBe(false);
    expect(Reflect.set(rule.requestedDays, '0', 20)).toBe(false);
    expect(Reflect.set(occurrences, '0', null)).toBe(false);
    expect(Reflect.set(occurrences[0], 'requestedDay', 20)).toBe(false);
    expect(Reflect.set(occurrences[0].date, 'day', 20)).toBe(false);
  });

  test('does not consult the clock or timezone', () => {
    const clock = jest.spyOn(globalThis, 'Date').mockImplementation(() => { throw new Error('Clock forbidden'); });
    const timezone = jest.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => { throw new Error('Timezone forbidden'); });
    try {
      expect(dates(Recurrence.twiceMonthly(30, 31), '2026-02-28', '2026-02-28'))
        .toEqual([['2026-02-28', 30], ['2026-02-28', 31]]);
      expect(clock).not.toHaveBeenCalled();
      expect(timezone).not.toHaveBeenCalled();
    } finally {
      clock.mockRestore();
      timezone.mockRestore();
    }
  });
});

describe('recurrence invariants', () => {
  test.each([
    Recurrence.monthly(10), Recurrence.monthly(31),
    Recurrence.twiceMonthly(4, 19), Recurrence.twiceMonthly(30, 31),
  ])('preserves calendar and ordering invariants for schedule %#', (rule) => {
    const from = date('2027-12-15');
    const through = date('2028-04-30');
    const output = rule.occurrences(from, through);
    expect(rule.occurrences(from, through)).toEqual(output);
    const counts = new Map<string, number>();
    for (const [index, occurrence] of output.entries()) {
      const { date: actual, requestedDay } = occurrence;
      expect(actual.compare(from)).toBeGreaterThanOrEqual(0);
      expect(actual.compare(through)).toBeLessThanOrEqual(0);
      expect(rule.requestedDays).toContain(requestedDay);
      const month = actual.toString().slice(0, 7);
      counts.set(month, (counts.get(month) ?? 0) + 1);
      if (index > 0) {
        const previous = output[index - 1];
        expect(previous.date.compare(actual)).toBeLessThanOrEqual(0);
        if (previous.date.equals(actual)) expect(previous.requestedDay).toBeLessThan(requestedDay);
      }
    }
    for (const count of counts.values()) expect(count).toBeLessThanOrEqual(rule.requestedDays.length);
    // Every full month retains every requested identity, even on collisions.
    for (const month of [1, 2, 3, 4]) {
      const length = FinancialDate.daysInMonth(2028, month);
      const monthly = rule.occurrences(FinancialDate.fromParts(2028, month, 1), FinancialDate.fromParts(2028, month, length));
      expect(monthly.map((item) => item.requestedDay)).toEqual(rule.requestedDays);
      for (const item of monthly) {
        expect([item.date.year, item.date.month]).toEqual([2028, month]);
        expect(item.date.day).toBe(Math.min(item.requestedDay, length));
      }
    }
  });
});
