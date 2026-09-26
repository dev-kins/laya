import { FinancialDate } from './FinancialDate';
import { obligationId, type ObligationId } from './identifiers';
import { calendarDate, nameText, nonNegativeMoney, scheduleRule } from './modelValidation';
import { Money } from './Money';
import { Recurrence } from './Recurrence';

export class EssentialObligation {
  private constructor(
    public readonly id: ObligationId,
    public readonly name: string,
    public readonly amount: Money,
    public readonly date: FinancialDate,
    public readonly recurrence: Recurrence | undefined,
  ) { Object.freeze(this); }

  static create(input: Readonly<{ id: ObligationId; name: string; amount: Money; date: FinancialDate; recurrence?: Recurrence }>): EssentialObligation {
    return new EssentialObligation(obligationId(input.id), nameText(input.name), nonNegativeMoney(input.amount),
      calendarDate(input.date), input.recurrence === undefined ? undefined : scheduleRule(input.recurrence));
  }
}
