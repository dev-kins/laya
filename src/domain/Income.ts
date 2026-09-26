import { FinancialDate } from './FinancialDate';
import { incomeId, type IncomeId } from './identifiers';
import { calendarDate, nameText, nonNegativeMoney, scheduleRule } from './modelValidation';
import { Money } from './Money';
import { Recurrence } from './Recurrence';

export type IncomeInput = Readonly<{ id: IncomeId; name: string; amount: Money; date: FinancialDate }> & (
  | Readonly<{ status: 'expected'; recurrence?: Recurrence }>
  | Readonly<{ status: 'received'; recurrence?: never }>
);

export class Income {
  private constructor(
    public readonly id: IncomeId,
    public readonly name: string,
    public readonly amount: Money,
    public readonly date: FinancialDate,
    public readonly status: 'expected' | 'received',
    public readonly recurrence: Recurrence | undefined,
  ) { Object.freeze(this); }

  static create(input: IncomeInput): Income {
    if (input.status !== 'expected' && input.status !== 'received') throw new RangeError('Invalid income status.');
    if (input.status === 'received' && input.recurrence !== undefined) throw new RangeError('Received income is a single actual receipt.');
    return new Income(incomeId(input.id), nameText(input.name), nonNegativeMoney(input.amount), calendarDate(input.date),
      input.status, input.recurrence === undefined ? undefined : scheduleRule(input.recurrence));
  }
}
