import { FinancialDate } from '../domain/FinancialDate';
import type { IncomeInput } from '../domain/Income';
import { nameText, nonNegativeMoney } from '../domain/modelValidation';
import { Money } from '../domain/Money';
import { Recurrence } from '../domain/Recurrence';

export interface IncomeForm {
  name: string;
  amount: string;
  date: string;
  status: '' | 'expected' | 'received';
  recurrence: 'none' | 'monthly' | 'twice-monthly';
  firstDay: string;
  secondDay: string;
}
export const emptyIncomeForm: IncomeForm = {
  name: '', amount: '', date: '', status: '', recurrence: 'none', firstDay: '', secondDay: '',
};
export type IncomeFormErrors = Partial<Record<keyof IncomeForm, string>>;
export class IncomeFormError extends Error {
  constructor(public readonly fields: IncomeFormErrors) {
    super('Please review the highlighted fields.');
  }
}
type IncomeFields = Omit<Extract<IncomeInput, { status: 'expected' }>, 'id'>
  | Omit<Extract<IncomeInput, { status: 'received' }>, 'id'>;

export function parseIncomeForm(form: IncomeForm): IncomeFields {
  const errors: IncomeFormErrors = {};
  function field<T>(key: keyof IncomeForm, message: string, parse: () => T): T | undefined {
    try { return parse(); } catch { errors[key] = message; return undefined; }
  }
  const name = field('name', 'Enter an income name of 1–200 characters.', () => nameText(form.name));
  const amount = field('amount', 'Enter a non-negative PHP amount with up to 2 decimal places, within the supported range.',
    () => nonNegativeMoney(Money.parse(form.amount, 'PHP')));
  const date = field('date', 'Enter a valid calendar date using YYYY-MM-DD.', () => FinancialDate.parse(form.date));
  if (form.status !== 'expected' && form.status !== 'received') errors.status = 'Choose Expected or Received.';
  const day = (key: 'firstDay' | 'secondDay') => field(key, 'Enter a whole day from 1 to 31.', () => {
    if (!/^[0-9]{1,2}$/.test(form[key].trim())) throw new RangeError('Invalid day.');
    return Recurrence.monthly(Number(form[key].trim())).requestedDays[0];
  });
  let recurrence: Recurrence | undefined;
  if (form.status === 'expected') {
    if (form.recurrence === 'monthly' || form.recurrence === 'twice-monthly') {
      const first = day('firstDay');
      if (form.recurrence === 'monthly' && first !== undefined) recurrence = Recurrence.monthly(first);
      if (form.recurrence === 'twice-monthly') {
        const second = day('secondDay');
        if (first !== undefined && second !== undefined) {
          recurrence = field('secondDay', 'Choose two different days from 1 to 31.', () => Recurrence.twiceMonthly(first, second));
        }
      }
    } else if (form.recurrence !== 'none') errors.recurrence = 'Choose a supported repeating schedule.';
  }
  if (Object.keys(errors).length || name === undefined || amount === undefined || date === undefined) {
    throw new IncomeFormError(errors);
  }
  // Explicitly omit recurrence for receipts, even if stale hidden fields arrive.
  return form.status === 'received' ? { name, amount, date, status: 'received' }
    : { name, amount, date, status: 'expected', recurrence };
}
