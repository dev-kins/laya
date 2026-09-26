import { type DebtInput } from '../domain/Debt';
import { FinancialDate } from '../domain/FinancialDate';
import { nameText, nonNegativeMoney } from '../domain/modelValidation';
import { Money } from '../domain/Money';
import { Recurrence } from '../domain/Recurrence';

export interface DebtForm {
  name: string;
  provider: string;
  balance: string;
  scheduledPayment: string;
  nextDueDate: string;
  interestChoice: '' | 'unknown' | 'known';
  interestRate: string;
  interestPeriod: 'annual' | 'monthly';
  recurrence: 'none' | 'monthly' | 'twice-monthly';
  firstDay: string;
  secondDay: string;
}

export const emptyDebtForm: DebtForm = {
  name: '', provider: '', balance: '', scheduledPayment: '', nextDueDate: '',
  interestChoice: '', interestRate: '', interestPeriod: 'annual',
  recurrence: 'none', firstDay: '', secondDay: '',
};
export type DebtFormErrors = Partial<Record<keyof DebtForm, string>>;
export class DebtFormError extends Error {
  constructor(public readonly fields: DebtFormErrors) {
    super('Please review the highlighted fields.');
  }
}

/** Percentage text to basis points: decimal digits -> BigInt -> checked integer.
 * No floating-point percentage arithmetic or rounding.
 */
export function parseInterestRate(text: string): number {
  const input = text.trim();
  if (!/^[0-9]+(?:\.[0-9]{1,2})?$/.test(input)) throw new RangeError('Invalid percentage.');
  const [whole, fraction = ''] = input.split('.');
  const exact = BigInt(whole + fraction.padEnd(2, '0'));
  if (exact > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError('Rate exceeds safe range.');
  return Number(exact);
}

export function parseDebtForm(form: DebtForm): Omit<DebtInput, 'id'> {
  const errors: DebtFormErrors = {};
  function field<T>(key: keyof DebtForm, message: string, parse: () => T): T | undefined {
    try { return parse(); } catch { errors[key] = message; return undefined; }
  }
  const amount = (key: 'balance' | 'scheduledPayment') => field(key,
    'Enter a non-negative PHP amount with up to 2 decimal places, within the supported range.',
    () => nonNegativeMoney(Money.parse(form[key], 'PHP')));
  const name = field('name', 'Enter a debt name of 1–200 characters.', () => nameText(form.name));
  const provider = form.provider.trim() === '' ? undefined
    : field('provider', 'Use a provider name of 1–200 characters.', () => nameText(form.provider));
  const balance = amount('balance');
  const scheduledPayment = form.scheduledPayment.trim() === '' ? undefined : amount('scheduledPayment');
  const nextDueDate = form.nextDueDate.trim() === '' ? undefined
    : field('nextDueDate', 'Enter a valid calendar date using YYYY-MM-DD.', () => FinancialDate.parse(form.nextDueDate));
  let interest: DebtInput['interest'] | undefined;
  if (form.interestChoice === 'unknown') interest = { kind: 'unknown' };
  else if (form.interestChoice === 'known') {
    const rate = field('interestRate', 'Enter a non-negative rate with up to 2 decimal places, within the supported range.',
      () => parseInterestRate(form.interestRate));
    if (form.interestPeriod !== 'annual' && form.interestPeriod !== 'monthly') errors.interestPeriod = 'Choose annual or monthly.';
    else if (rate !== undefined) interest = { kind: 'known', basisPoints: rate, period: form.interestPeriod };
  } else errors.interestChoice = 'Choose whether you know the interest rate.';
  const day = (key: 'firstDay' | 'secondDay') => field(key, 'Enter a whole day from 1 to 31.', () => {
    if (!/^[0-9]{1,2}$/.test(form[key].trim())) throw new RangeError('Invalid day.');
    return Recurrence.monthly(Number(form[key].trim())).requestedDays[0];
  });
  let recurrence: Recurrence | undefined;
  if (form.recurrence === 'monthly' || form.recurrence === 'twice-monthly') {
    const first = day('firstDay');
    if (form.recurrence === 'monthly' && first !== undefined) recurrence = Recurrence.monthly(first);
    if (form.recurrence === 'twice-monthly') {
      const second = day('secondDay');
      if (first !== undefined && second !== undefined) {
        recurrence = field('secondDay', 'Choose two different days from 1 to 31.', () => Recurrence.twiceMonthly(first, second));
      }
    }
  } else if (form.recurrence !== 'none') errors.recurrence = 'Choose a supported payment schedule.';
  if (Object.keys(errors).length || name === undefined || balance === undefined || interest === undefined) {
    throw new DebtFormError(errors);
  }
  return { name, provider, balance, scheduledPayment, nextDueDate, interest, recurrence };
}
