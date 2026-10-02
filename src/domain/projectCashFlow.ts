import type { FinancialDate } from './FinancialDate';
import { type FinancialEvent, sortFinancialEvents } from './FinancialEvent';
import { calendarDate, nonNegativeMoney } from './modelValidation';
import type { Money } from './Money';

export interface ProjectCashFlowInput {
  readonly startingBalance: Money;
  readonly startDate: FinancialDate;
  readonly through: FinancialDate;
  readonly events: readonly FinancialEvent[];
}

export interface CashFlowPoint {
  readonly event: FinancialEvent;
  readonly balanceAfter: Money;
}

export interface ExcludedCashFlowEvent {
  readonly event: FinancialEvent;
  readonly reason: 'outside-window' | 'actual-event';
}

export interface CashFlowProjection {
  readonly start: Readonly<{ date: FinancialDate; balance: Money }>;
  readonly through: FinancialDate;
  readonly points: readonly CashFlowPoint[];
  readonly excludedEvents: readonly ExcludedCashFlowEvent[];
  readonly endingBalance: Money;
  readonly minimumProjectedBalance: Money;
  readonly minimumBalanceDate: FinancialDate;
}

/** Forecast-only scenario over (startDate, through]; never reconciles actuals.
 * Events are validated immutable FinancialEvents, not raw persisted/JSON rows.
 */
export function projectCashFlow(input: ProjectCashFlowInput): CashFlowProjection {
  const startDate = calendarDate(input.startDate);
  const through = calendarDate(input.through);
  if (startDate.compare(through) > 0) throw new RangeError('Projection start must not be after its end.');
  const startingBalance = nonNegativeMoney(input.startingBalance);
  // Sort/check ALL identities before filtering, including excluded actuals/ranges.
  const events = sortFinancialEvents(input.events);
  const points: CashFlowPoint[] = [];
  const excludedEvents: ExcludedCashFlowEvent[] = [];
  let balance = startingBalance;
  let minimumProjectedBalance = startingBalance;
  let minimumBalanceDate = startDate;

  for (const event of events) {
    if (event.date.compare(startDate) <= 0 || event.date.compare(through) > 0) {
      excludedEvents.push(Object.freeze({ event, reason: 'outside-window' }));
      continue;
    }
    switch (event.kind) {
      case 'received-income': case 'debt-payment':
        excludedEvents.push(Object.freeze({ event, reason: 'actual-event' }));
        continue;
      case 'expected-income': balance = balance.add(event.amount); break;
      case 'essential-due': case 'debt-due': balance = balance.subtract(event.amount); break;
      default: throw new RangeError('Unsupported projection event kind.');
    }
    points.push(Object.freeze({ event, balanceAfter: balance }));
    // Strict comparison retains the starting/first occurrence on equal minima.
    if (balance.compare(minimumProjectedBalance) < 0) {
      minimumProjectedBalance = balance;
      minimumBalanceDate = event.date;
    }
  }
  return Object.freeze({
    start: Object.freeze({ date: startDate, balance: startingBalance }), through,
    points: Object.freeze(points), excludedEvents: Object.freeze(excludedEvents),
    endingBalance: balance, minimumProjectedBalance, minimumBalanceDate,
  });
}
