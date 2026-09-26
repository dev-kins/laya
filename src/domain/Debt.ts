import { FinancialDate } from './FinancialDate';
import { debtId, type DebtId } from './identifiers';
import { calendarDate, nameText, nonNegativeMoney, scheduleRule } from './modelValidation';
import { Money } from './Money';
import { Recurrence } from './Recurrence';

export type Interest =
  | Readonly<{ kind: 'unknown' }>
  | Readonly<{ kind: 'known'; basisPoints: number; period: 'monthly' | 'annual' }>;

export interface DebtInput {
  readonly id: DebtId;
  readonly name: string;
  readonly provider?: string;
  readonly balance: Money;
  readonly scheduledPayment?: Money;
  readonly nextDueDate?: FinancialDate;
  readonly recurrence?: Recurrence;
  readonly interest: Interest;
}

function interestInfo(value: Interest): Interest {
  if (!value || typeof value !== 'object') throw new TypeError('Interest must be explicit.');
  if (value.kind === 'unknown') {
    if ('basisPoints' in value || 'period' in value) throw new RangeError('Unknown interest cannot include a rate.');
    return Object.freeze({ kind: 'unknown' });
  }
  if (value.kind !== 'known' || !Number.isSafeInteger(value.basisPoints) || value.basisPoints < 0 ||
      !['monthly', 'annual'].includes(value.period)) throw new RangeError('Invalid interest information.');
  return Object.freeze({ kind: 'known', basisPoints: value.basisPoints, period: value.period });
}

/** Reported outstanding snapshot, never principal minus payment history. */
export class Debt {
  private constructor(
    public readonly id: DebtId,
    public readonly name: string,
    public readonly provider: string | undefined,
    public readonly balance: Money,
    public readonly scheduledPayment: Money | undefined,
    public readonly nextDueDate: FinancialDate | undefined,
    public readonly recurrence: Recurrence | undefined,
    public readonly interest: Interest,
  ) { Object.freeze(this); }

  static create(input: DebtInput): Debt {
    return new Debt(debtId(input.id), nameText(input.name),
      input.provider === undefined ? undefined : nameText(input.provider), nonNegativeMoney(input.balance),
      input.scheduledPayment === undefined ? undefined : nonNegativeMoney(input.scheduledPayment),
      input.nextDueDate === undefined ? undefined : calendarDate(input.nextDueDate),
      input.recurrence === undefined ? undefined : scheduleRule(input.recurrence), interestInfo(input.interest));
  }
}
