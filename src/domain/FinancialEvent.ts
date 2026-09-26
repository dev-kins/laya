import { FinancialDate } from './FinancialDate';
import { debtId, incomeId, obligationId, paymentId, validateIdentifier, type DebtId, type IncomeId, type ObligationId, type PaymentId } from './identifiers';
import { calendarDate, nonNegativeMoney } from './modelValidation';
import { Money } from './Money';

type Source =
  | Readonly<{ kind: 'expected-income' | 'received-income'; sourceId: IncomeId }>
  | Readonly<{ kind: 'debt-due'; sourceId: DebtId }>
  | Readonly<{ kind: 'essential-due'; sourceId: ObligationId }>
  | Readonly<{ kind: 'debt-payment'; sourceId: PaymentId }>;
export type FinancialEventInput = Source & Readonly<{
  date: FinancialDate;
  amount: Money;
  /** Stable caller-supplied slot, e.g. requested-day-30 vs requested-day-31. */
  occurrenceKey: string;
}>;

const priority = { 'essential-due': 0, 'debt-due': 1, 'debt-payment': 2, 'received-income': 3, 'expected-income': 4 } as const;
export class FinancialEvent {
  private constructor(
    public readonly id: string,
    public readonly kind: Source['kind'],
    public readonly direction: 'inflow' | 'outflow',
    public readonly sourceId: Source['sourceId'],
    public readonly date: FinancialDate,
    public readonly amount: Money,
    public readonly occurrenceKey: string,
  ) { Object.freeze(this); }

  /** A normalized model only. Caller determines occurrences; no schedule expansion. */
  static create(input: FinancialEventInput): FinancialEvent {
    let sourceId: Source['sourceId'];
    switch (input.kind) {
      case 'expected-income': case 'received-income': sourceId = incomeId(input.sourceId); break;
      case 'debt-due': sourceId = debtId(input.sourceId); break;
      case 'essential-due': sourceId = obligationId(input.sourceId); break;
      case 'debt-payment': sourceId = paymentId(input.sourceId); break;
      default: throw new RangeError('Invalid financial event kind.');
    }
    const date = calendarDate(input.date);
    const amount = nonNegativeMoney(input.amount);
    if (amount.minorUnits === 0) throw new RangeError('Financial event amount must be positive.');
    const slot = validateIdentifier(input.occurrenceKey);
    const id = JSON.stringify([input.kind, sourceId, date.toString(), slot]);
    return new FinancialEvent(id, input.kind,
      input.kind === 'expected-income' || input.kind === 'received-income' ? 'inflow' : 'outflow',
      sourceId, date, amount, slot);
  }
}

const lexical = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;
/** Date, conservative outflow-first kind priority, then code-unit source/slot order. */
export function compareFinancialEvents(left: FinancialEvent, right: FinancialEvent): number {
  return left.date.compare(right.date) || priority[left.kind] - priority[right.kind] ||
    lexical(left.sourceId, right.sourceId) || lexical(left.occurrenceKey, right.occurrenceKey);
}

export function sortFinancialEvents(events: readonly FinancialEvent[]): readonly FinancialEvent[] {
  const seen = new Set<string>();
  for (const event of events) {
    if (seen.has(event.id)) throw new RangeError('Duplicate financial event identity.');
    seen.add(event.id);
  }
  return Object.freeze([...events].sort(compareFinancialEvents));
}
