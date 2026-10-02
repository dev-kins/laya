import type { FinancialDate } from './FinancialDate';
import { calendarDate, nonNegativeMoney } from './modelValidation';
import { Money } from './Money';
import type { CashFlowProjection } from './projectCashFlow';

export interface SafeToPayResult {
  readonly amount: Money;
  readonly protectionStartDate: FinancialDate;
  readonly protectionThroughDate: FinancialDate;
}

/** Consumes a domain-produced projection; does not validate/recalculate its points.
 * Removing X at start shifts every balance by -X, so the minimum bounds X.
 */
export function calculateSafeToPay(projection: CashFlowProjection): SafeToPayResult {
  const protectionStartDate = calendarDate(projection.start.date);
  const protectionThroughDate = calendarDate(projection.through);
  if (protectionStartDate.compare(protectionThroughDate) > 0) throw new RangeError('Protection start must not be after its end.');
  const startingBalance = nonNegativeMoney(projection.start.balance);
  const suppliedMinimum = projection.minimumProjectedBalance;
  if (!(suppliedMinimum instanceof Money)) throw new TypeError('Projection minimum must be Money.');
  const minimum = Money.fromMinorUnits(suppliedMinimum.minorUnits, suppliedMinimum.currency);
  if (minimum.compare(startingBalance) > 0) throw new RangeError('Projection minimum must not exceed its starting balance.');
  const zero = Money.zero('PHP');
  return Object.freeze({
    amount: minimum.compare(zero) < 0 ? zero : minimum,
    protectionStartDate,
    protectionThroughDate,
  });
}
