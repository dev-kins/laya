import { Debt } from '../domain/Debt';
import { debtId } from '../domain/identifiers';
import { DebtFormError, emptyDebtForm, parseDebtForm, parseInterestRate, type DebtForm } from './debtForm';

const form: DebtForm = { ...emptyDebtForm, name: 'Synthetic debt', balance: '10584.78', interestChoice: 'unknown' };
const parse = (changes: Partial<DebtForm> = {}) => Debt.create({ ...parseDebtForm({ ...form, ...changes }), id: debtId('synthetic') });

test.each([['10584', 1058400], ['10584.7', 1058470], ['10584.78', 1058478], ['0', 0], ['90071992547409.91', Number.MAX_SAFE_INTEGER]])
('exact balance input %s', (balance, expected) => { expect(parse({ balance: String(balance) }).balance.minorUnits).toBe(expected); });

test.each(['', '-100', '10584.789', '1,000', '₱100', '1e3', 'Infinity', '90071992547409.92'])
('invalid balance %s is a field error', balance => {
  expect(() => parse({ balance })).toThrow(DebtFormError);
  try { parse({ balance }); } catch (error) { expect(error).toMatchObject({ fields: { balance: expect.any(String) } }); }
});
test.each(['', '   ', 'x'.repeat(201)])('invalid debt name %#', name => { expect(() => parse({ name })).toThrow(DebtFormError); });
test('names use domain normalization; provider is optional', () => {
  expect(parse({ name: ' Synthetic ', provider: '' }).name).toBe('Synthetic');
  expect(parse().provider).toBeUndefined();
  expect(parse({ provider: ' Sample provider ' }).provider).toBe('Sample provider');
  expect(() => parse({ provider: 'x'.repeat(201) })).toThrow(DebtFormError);
});
test('blank payment is absent; entered zero is Money zero', () => {
  expect(parse().scheduledPayment).toBeUndefined();
  expect(parse({ scheduledPayment: '0' }).scheduledPayment?.minorUnits).toBe(0);
  expect(parse({ scheduledPayment: '1.25' }).scheduledPayment?.minorUnits).toBe(125);
});
test.each(['-1', '1.001', '90071992547409.92'])('invalid scheduled amount %s', scheduledPayment => {
  expect(() => parse({ scheduledPayment })).toThrow(DebtFormError);
});
test.each([['0', 0], ['1', 100], ['1.25', 125], ['12.50', 1250], ['90071992547409.91', Number.MAX_SAFE_INTEGER]])
('exact percentage %s', (text, expected) => { expect(parseInterestRate(String(text))).toBe(expected); });
test.each(['', '-1', '0.001', '1e2', '1,000', '1%', '90071992547409.92'])('reject invalid percentage %s', rate => {
  expect(() => parseInterestRate(rate)).toThrow();
  expect(() => parse({ interestChoice: 'known', interestRate: rate })).toThrow(DebtFormError);
});
test('interest choice is required; unknown does not acquire a stale rate', () => {
  expect(() => parse({ interestChoice: '' })).toThrow(DebtFormError);
  expect(parse({ interestRate: '12.50' }).interest).toEqual({ kind: 'unknown' });
});
test.each(['annual', 'monthly'] as const)('known %s interest preserves zero and nonzero', interestPeriod => {
  expect(parse({ interestChoice: 'known', interestRate: '0', interestPeriod }).interest)
    .toEqual({ kind: 'known', basisPoints: 0, period: interestPeriod });
  expect(parse({ interestChoice: 'known', interestRate: '1.25', interestPeriod }).interest)
    .toEqual({ kind: 'known', basisPoints: 125, period: interestPeriod });
});
test('calendar date can be absent or a canonical leap date', () => {
  expect(parse().nextDueDate).toBeUndefined();
  expect(parse({ nextDueDate: '2028-02-29' }).nextDueDate?.toString()).toBe('2028-02-29');
});
test.each(['2026-02-29', '2028-2-29', '2028-02-29T00:00:00Z', 'today', '2028-02-29 '])('reject invalid calendar date %s', nextDueDate => {
  expect(() => parse({ nextDueDate })).toThrow(DebtFormError);
});
test('recurrence preserves anchors, canonicalizes order and ignores hidden fields', () => {
  expect(parse().recurrence).toBeUndefined();
  expect(parse({ recurrence: 'monthly', firstDay: '31' }).recurrence?.requestedDays).toEqual([31]);
  expect(parse({ recurrence: 'twice-monthly', firstDay: '31', secondDay: '30' }).recurrence?.requestedDays).toEqual([30, 31]);
  expect(parse({ recurrence: 'none', firstDay: 'invalid' }).recurrence).toBeUndefined();
});
test.each(['', '0', '32', '-1', '1.5', '1e1'])('invalid recurrence day %s', firstDay => {
  expect(() => parse({ recurrence: 'monthly', firstDay })).toThrow(DebtFormError);
});
test('duplicate twice-monthly days rejected', () => {
  expect(() => parse({ recurrence: 'twice-monthly', firstDay: '30', secondDay: '30' })).toThrow(DebtFormError);
});
test.each(Array.from({ length: 8 }, (_, mask) => mask))('schedule fields remain independent: %s', mask => {
  const result = parse({ scheduledPayment: mask & 1 ? '0' : '', nextDueDate: mask & 2 ? '2028-02-29' : '',
    recurrence: mask & 4 ? 'monthly' : 'none', firstDay: '31' });
  expect(result.scheduledPayment !== undefined).toBe(Boolean(mask & 1));
  expect(result.nextDueDate !== undefined).toBe(Boolean(mask & 2));
  expect(result.recurrence !== undefined).toBe(Boolean(mask & 4));
});
