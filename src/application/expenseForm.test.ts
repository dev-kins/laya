import { obligationId } from '../domain/identifiers';
import { EssentialObligation } from '../domain/EssentialObligation';
import { emptyExpenseForm, ExpenseFormError, parseExpenseForm, type ExpenseForm } from './expenseForm';

const form: ExpenseForm = { ...emptyExpenseForm, name: 'Synthetic expense', amount: '25000.50', date: '2026-10-04' };
const parse = (changes: Partial<ExpenseForm> = {}) => EssentialObligation.create({ ...parseExpenseForm({ ...form, ...changes }), id: obligationId('synthetic') });

test.each([['25000', 2500000], ['25000.5', 2500050], ['25000.50', 2500050], ['0', 0], ['90071992547409.91', Number.MAX_SAFE_INTEGER]])
('exact amount %s', (amount, expected) => { expect(parse({ amount: String(amount) }).amount.minorUnits).toBe(expected); });

test.each(['', '-500', '25000.999', '1,000', '₱100', '1e3', 'Infinity', '90071992547409.92'])
('invalid amount %s is a field error', amount => {
  expect(() => parse({ amount })).toThrow(ExpenseFormError);
  try { parse({ amount }); } catch (error) { expect(error).toMatchObject({ fields: { amount: expect.any(String) } }); }
});
test.each(['', '   ', 'x'.repeat(201)])('required bounded name %#', name => { expect(() => parse({ name })).toThrow(ExpenseFormError); });
test('name normalization reuses domain rules', () => { expect(parse({ name: ' Synthetic ' }).name).toBe('Synthetic'); });
test.each(['', '2026-02-29', '2028-2-29', '2028-02-29T00:00:00Z', 'today', '2028-02-29 ', '0000-01-01'])
('required canonical date %s', date => { expect(() => parse({ date })).toThrow(ExpenseFormError); });
test.each(['2026-10-04', '2028-02-29', '0001-01-01', '9999-12-31'])('valid calendar date %s', date => {
  expect(parse({ date }).date.toString()).toBe(date);
});
test('obligation may omit recurrence and ignores unused day text', () => {
  expect(parse({ firstDay: 'invalid' }).recurrence).toBeUndefined();
});
test.each(['4', '31'])('obligation monthly preserves day %s', firstDay => {
  expect(parse({ recurrence: 'monthly', firstDay }).recurrence?.requestedDays).toEqual([Number(firstDay)]);
});
test.each([['4', '19', [4, 19]], ['31', '30', [30, 31]]] as const)('obligation twice monthly preserves %s / %s', (firstDay, secondDay, days) => {
  expect(parse({ recurrence: 'twice-monthly', firstDay, secondDay }).recurrence?.requestedDays).toEqual(days);
});
test.each(['', '0', '32', '-1', '1.5', '1e1'])('invalid recurring day %s', firstDay => {
  expect(() => parse({ recurrence: 'monthly', firstDay })).toThrow(ExpenseFormError);
  expect(() => parse({ recurrence: 'twice-monthly', firstDay: '4', secondDay: firstDay })).toThrow(ExpenseFormError);
});
test('duplicate days and unsupported schedule rejected', () => {
  expect(() => parse({ recurrence: 'twice-monthly', firstDay: '30', secondDay: '30' })).toThrow(ExpenseFormError);
  expect(() => parse({ recurrence: 'weekly' as ExpenseForm['recurrence'] })).toThrow(ExpenseFormError);
});
