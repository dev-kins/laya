import { incomeId } from '../domain/identifiers';
import { Income } from '../domain/Income';
import { emptyIncomeForm, IncomeFormError, parseIncomeForm, type IncomeForm } from './incomeForm';

const form: IncomeForm = { ...emptyIncomeForm, name: 'Synthetic income', amount: '25000.50', date: '2026-10-04', status: 'expected' };
const parse = (changes: Partial<IncomeForm> = {}) => Income.create({ ...parseIncomeForm({ ...form, ...changes }), id: incomeId('synthetic') });

test.each([['25000', 2500000], ['25000.5', 2500050], ['25000.50', 2500050], ['0', 0], ['90071992547409.91', Number.MAX_SAFE_INTEGER]])
('exact amount %s', (amount, expected) => { expect(parse({ amount: String(amount) }).amount.minorUnits).toBe(expected); });

test.each(['', '-500', '25000.999', '1,000', '₱100', '1e3', 'Infinity', '90071992547409.92'])
('invalid amount %s is a field error', amount => {
  expect(() => parse({ amount })).toThrow(IncomeFormError);
  try { parse({ amount }); } catch (error) { expect(error).toMatchObject({ fields: { amount: expect.any(String) } }); }
});
test.each(['', '   ', 'x'.repeat(201)])('required bounded name %#', name => { expect(() => parse({ name })).toThrow(IncomeFormError); });
test('name normalization reuses domain rules', () => { expect(parse({ name: ' Synthetic ' }).name).toBe('Synthetic'); });
test.each(['', '2026-02-29', '2028-2-29', '2028-02-29T00:00:00Z', 'today', '2028-02-29 ', '0000-01-01'])
('required canonical date %s', date => { expect(() => parse({ date })).toThrow(IncomeFormError); });
test.each(['2026-10-04', '2028-02-29', '0001-01-01', '9999-12-31'])('valid calendar date %s', date => {
  expect(parse({ date }).date.toString()).toBe(date);
});
test.each(['', 'unknown'] as IncomeForm['status'][])('explicit valid status required: %s', status => {
  expect(() => parse({ status })).toThrow(IncomeFormError);
});
test('expected may omit recurrence and ignores unused day text', () => {
  expect(parse({ firstDay: 'invalid' }).recurrence).toBeUndefined();
  expect(parse().status).toBe('expected');
});
test.each(['4', '31'])('expected monthly preserves day %s', firstDay => {
  expect(parse({ recurrence: 'monthly', firstDay }).recurrence?.requestedDays).toEqual([Number(firstDay)]);
});
test.each([['4', '19', [4, 19]], ['31', '30', [30, 31]]] as const)('expected twice monthly preserves %s / %s', (firstDay, secondDay, days) => {
  expect(parse({ recurrence: 'twice-monthly', firstDay, secondDay }).recurrence?.requestedDays).toEqual(days);
});
test.each(['', '0', '32', '-1', '1.5', '1e1'])('invalid recurring day %s', firstDay => {
  expect(() => parse({ recurrence: 'monthly', firstDay })).toThrow(IncomeFormError);
  expect(() => parse({ recurrence: 'twice-monthly', firstDay: '4', secondDay: firstDay })).toThrow(IncomeFormError);
});
test('duplicate days and unsupported schedule rejected', () => {
  expect(() => parse({ recurrence: 'twice-monthly', firstDay: '30', secondDay: '30' })).toThrow(IncomeFormError);
  expect(() => parse({ recurrence: 'weekly' as IncomeForm['recurrence'] })).toThrow(IncomeFormError);
});
test.each(['none', 'monthly', 'twice-monthly'] as const)('received excludes even stale %s recurrence before domain construction', recurrence => {
  const input = parseIncomeForm({ ...form, status: 'received', recurrence, firstDay: '30', secondDay: '31' });
  expect(input).not.toHaveProperty('recurrence');
  const received = Income.create({ ...input, id: incomeId('synthetic') });
  expect(received.status).toBe('received');
  expect(received.recurrence).toBeUndefined();
});
