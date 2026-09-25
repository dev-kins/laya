import { FinancialDate } from './FinancialDate';

describe('FinancialDate', () => {
  test('reads explicit calendar parts and serializes canonically', () => {
    const date = FinancialDate.parse('2026-09-24');
    expect([date.year, date.month, date.day]).toEqual([2026, 9, 24]);
    expect(date.toString()).toBe('2026-09-24');
    expect(FinancialDate.fromParts(1, 1, 1).toString()).toBe('0001-01-01');
  });

  test.each(['0001-01-01', '9999-12-31', '2024-02-29', '2000-02-29', '2400-02-29', '2026-04-30', '2026-01-31']) (
    'accepts valid Gregorian date %s', (text) => {
      expect(FinancialDate.parse(text).toString()).toBe(text);
    },
  );

  test.each([
    '0000-01-01', '10000-01-01', '2026-00-01', '2026-13-01', '2026-01-00',
    '2026-01-32', '2026-04-31', '2026-06-31', '2026-09-31', '2026-11-31',
    '2024-02-30', '2026-02-29', '1900-02-29', '2100-02-29',
    '2026-9-01', '2026-09-1', '26-09-01', '2026/09/01', ' 2026-09-01',
    '2026-09-01 ', '2026-09-01\n', '2026-09-01T00:00:00Z', '', '２０２６-09-01',
  ])('rejects invalid or noncanonical date %s', (text) => {
    expect(() => FinancialDate.parse(text)).toThrow(RangeError);
  });

  test.each([null, undefined, 20260924])('rejects non-text input: %s', (value) => {
    expect(() => FinancialDate.parse(value)).toThrow(RangeError);
  });

  test.each([
    [0, 1, 1], [-1, 1, 1], [10000, 1, 1], [2026.5, 1, 1], [NaN, 1, 1],
    [Infinity, 1, 1], [2026, 0, 1], [2026, 13, 1], [2026, 1.5, 1],
    [2026, NaN, 1], [2026, Infinity, 1], [2026, 1, 0], [2026, 1, -1],
    [2026, 1, 32], [2026, 1, 1.5], [2026, 1, NaN], [2026, 1, Infinity],
  ])('rejects invalid parts %s/%s/%s', (year, month, day) => {
    expect(() => FinancialDate.fromParts(year, month, day)).toThrow(RangeError);
  });

  test.each([
    ['2025-12-31', '2026-01-01', -1], ['2026-01-31', '2026-02-01', -1],
    ['2024-02-29', '2024-03-01', -1], ['2026-09-25', '2026-09-24', 1],
    ['2026-09-24', '2026-09-24', 0], ['0001-01-01', '9999-12-31', -1],
  ])('compares %s to %s chronologically', (left, right, expected) => {
    const date = FinancialDate.parse(left);
    expect(date.compare(FinancialDate.parse(right))).toBe(expected);
    expect(date.equals(FinancialDate.parse(right))).toBe(expected === 0);
  });

  test('remains timezone-independent without consulting Date or Intl', () => {
    const dateSpy = jest.spyOn(globalThis, 'Date').mockImplementation(() => {
      throw new Error('Domain calendar dates must not consult the device clock.');
    });
    const intlSpy = jest.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
      throw new Error('Domain calendar dates must not consult a timezone.');
    });
    try {
      const date = FinancialDate.parse('2024-02-29');
      expect(date.toString()).toBe('2024-02-29');
      expect(date.equals(FinancialDate.fromParts(2024, 2, 29))).toBe(true);
      expect(date.compare(FinancialDate.parse('2024-03-01'))).toBe(-1);
      expect(() => FinancialDate.parse('1900-02-29')).toThrow(RangeError);
      expect(dateSpy).not.toHaveBeenCalled();
      expect(intlSpy).not.toHaveBeenCalled();
    } finally {
      dateSpy.mockRestore();
      intlSpy.mockRestore();
    }
  });

  test('cannot be mutated', () => {
    const date = FinancialDate.parse('2026-09-24');
    for (const field of ['year', 'month', 'day']) {
      expect(Reflect.set(date, field, 0)).toBe(false);
    }
    expect(date.toString()).toBe('2026-09-24');
  });
});
