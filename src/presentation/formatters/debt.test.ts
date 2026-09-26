import { FinancialDate } from '../../domain/FinancialDate';
import { Money } from '../../domain/Money';
import { Recurrence } from '../../domain/Recurrence';
import { formatFinancialDate, formatInterest, formatPHP, formatRecurrence } from './debt';

test.each([
  [0, '₱0.00'], [1, '₱0.01'], [100, '₱1.00'], [176400, '₱1,764.00'],
  [1058478, '₱10,584.78'], [Number.MAX_SAFE_INTEGER, '₱90,071,992,547,409.91'],
  [-1, '-₱0.01'], [Number.MIN_SAFE_INTEGER, '-₱90,071,992,547,409.91'],
])('exact PHP formatting: %s', (minorUnits, expected) => {
  expect(formatPHP(Money.fromMinorUnits(minorUnits, 'PHP'))).toBe(expected);
});
test('unknown interest is explicitly not entered', () => {
  expect(formatInterest({ kind: 'unknown' })).toBe('Interest rate not entered');
});
describe.each(['monthly', 'annual'] as const)('%s rates', period => {
  test.each([[0, '0'], [1, '0.01'], [100, '1'], [125, '1.25'], [1250, '12.5'], [Number.MAX_SAFE_INTEGER, '90071992547409.91']])
  ('exact basis points: %s', (basisPoints, percentage) => {
    expect(formatInterest({ kind: 'known', basisPoints: Number(basisPoints), period }))
      .toBe(`${percentage}% ${period === 'annual' ? 'annually' : 'monthly'}`);
  });
});
test.each([
  ['2026-10-10', 'Oct 10, 2026'], ['2028-02-29', 'Feb 29, 2028'],
  ['0001-01-01', 'Jan 1, 0001'], ['9999-12-31', 'Dec 31, 9999'],
])('calendar formatting: %s', (date, expected) => {
  expect(formatFinancialDate(FinancialDate.parse(date))).toBe(expected);
});
test.each([
  [Recurrence.monthly(1), 'Monthly on day 1'],
  [Recurrence.monthly(10), 'Monthly on day 10'],
  [Recurrence.monthly(31), 'Monthly on day 31. Uses the last day in shorter months.'],
  [Recurrence.twiceMonthly(15, 30), 'Twice monthly on days 15 and 30. Each missing day uses the last day in shorter months; both scheduled days are retained.'],
  [Recurrence.twiceMonthly(30, 31), 'Twice monthly on days 30 and 31. Each missing day uses the last day in shorter months; both scheduled days are retained.'],
])('requested anchors remain visible %#', (rule, expected) => {
  expect(formatRecurrence(rule as Recurrence)).toBe(expected);
});
