import { FinancialDate } from '../domain/FinancialDate';
import type { EssentialObligation } from '../domain/EssentialObligation';
import { nameText, nonNegativeMoney } from '../domain/modelValidation';
import { Money } from '../domain/Money';
import { Recurrence } from '../domain/Recurrence';

export interface ExpenseForm {
  name: string;
  amount: string;
  date: string;
  recurrence: 'none' | 'monthly' | 'twice-monthly';
  firstDay: string;
  secondDay: string;
}
export const emptyExpenseForm: ExpenseForm = {
  name: '', amount: '', date: '', recurrence: 'none', firstDay: '', secondDay: '',
};
export type ExpenseFormErrors = Partial<Record<keyof ExpenseForm, string>>;
export class ExpenseFormError extends Error {
  constructor(public readonly fields: ExpenseFormErrors) {
    super('Please review the highlighted fields.');
  }
}
type ExpenseFields = Omit<Parameters<typeof EssentialObligation.create>[0], 'id'>;

export function parseExpenseForm(form: ExpenseForm): ExpenseFields {
  const errors: ExpenseFormErrors = {};
  function field<T>(key: keyof ExpenseForm, message: string, parse: () => T): T | undefined {
    try { return parse(); } catch { errors[key] = message; return undefined; }
  }
  const name = field('name', 'Enter an expense name of 1–200 characters.', () => nameText(form.name));
  const amount = field('amount', 'Enter a non-negative PHP amount with up to 2 decimal places, within the supported range.',
    () => nonNegativeMoney(Money.parse(form.amount, 'PHP')));
  const date = field('date', 'Enter a valid calendar date using YYYY-MM-DD.', () => FinancialDate.parse(form.date));
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
  } else if (form.recurrence !== 'none') errors.recurrence = 'Choose a supported repeating schedule.';
  if (Object.keys(errors).length || name === undefined || amount === undefined || date === undefined) {
    throw new ExpenseFormError(errors);
  }
  return { name, amount, date, recurrence };
}
