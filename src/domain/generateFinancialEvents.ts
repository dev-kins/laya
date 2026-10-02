import type { Debt } from './Debt';
import type { DebtPayment } from './DebtPayment';
import type { EssentialObligation } from './EssentialObligation';
import { FinancialDate } from './FinancialDate';
import { FinancialEvent, type FinancialEventInput, sortFinancialEvents } from './FinancialEvent';
import type { Income } from './Income';
import { calendarDate } from './modelValidation';
import type { Recurrence } from './Recurrence';

export interface GenerateFinancialEventsInput {
  readonly from: FinancialDate;
  readonly through: FinancialDate;
  readonly debts: readonly Debt[];
  readonly incomes: readonly Income[];
  readonly essentialObligations: readonly EssentialObligation[];
  readonly debtPayments: readonly DebtPayment[];
}

/** Expands validated entities into facts/expectations, not reconciled cash flows.
 * No clock, storage, balance calculation, or inference from payment history.
 */
export function generateFinancialEvents(input: GenerateFinancialEventsInput): readonly FinancialEvent[] {
  const from = calendarDate(input.from);
  const through = calendarDate(input.through);
  if (from.compare(through) > 0) throw new RangeError('Range start must not be after its end.');
  const events: FinancialEvent[] = [];

  function append(event: FinancialEventInput): void {
    if (event.amount.minorUnits === 0 || event.date.compare(from) < 0 || event.date.compare(through) > 0) return;
    events.push(FinancialEvent.create(event));
  }

  function recurring(event: FinancialEventInput, rule: Recurrence): void {
    if (event.amount.minorUnits === 0) return;
    const start = event.date.compare(from) > 0 ? event.date : from;
    if (start.compare(through) > 0) return;
    for (const occurrence of rule.occurrences(start, through)) {
      append({ ...event, date: occurrence.date, occurrenceKey: `requested-day:${occurrence.requestedDay}` });
    }
  }

  for (const income of input.incomes) {
    const event: FinancialEventInput = {
      kind: income.status === 'expected' ? 'expected-income' : 'received-income',
      sourceId: income.id, amount: income.amount, date: income.date, occurrenceKey: 'one-time',
    };
    if (income.status === 'expected' && income.recurrence) recurring(event, income.recurrence);
    else append(event);
  }
  for (const obligation of input.essentialObligations) {
    const event: FinancialEventInput = {
      kind: 'essential-due', sourceId: obligation.id, amount: obligation.amount,
      date: obligation.date, occurrenceKey: 'one-time',
    };
    if (obligation.recurrence) recurring(event, obligation.recurrence);
    else append(event);
  }
  for (const debt of input.debts) {
    if (!debt.scheduledPayment || !debt.nextDueDate || debt.scheduledPayment.minorUnits === 0) continue;
    const anchor = debt.nextDueDate;
    const event: FinancialEventInput = {
      kind: 'debt-due', sourceId: debt.id, amount: debt.scheduledPayment,
      date: anchor, occurrenceKey: 'one-time',
    };
    append(event);
    // Explicit next due replaces ALL normal slots in its calendar month.
    // Check for a later month before constructing it, including at year 9999.
    if (!debt.recurrence || through.year < anchor.year ||
        (through.year === anchor.year && through.month <= anchor.month)) continue;
    const nextMonth = anchor.month === 12
      ? FinancialDate.fromParts(anchor.year + 1, 1, 1)
      : FinancialDate.fromParts(anchor.year, anchor.month + 1, 1);
    recurring({ ...event, date: nextMonth }, debt.recurrence);
  }
  for (const payment of input.debtPayments) {
    append({ kind: 'debt-payment', sourceId: payment.id, amount: payment.amount,
      date: payment.date, occurrenceKey: 'one-time' });
  }
  return sortFinancialEvents(events);
}
