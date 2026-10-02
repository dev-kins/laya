import type { SafeToPayResult } from './calculateSafeToPay';
import { Debt } from './Debt';
import type { FinancialDate } from './FinancialDate';
import { calendarDate, nonNegativeMoney } from './modelValidation';
import { Money } from './Money';

export interface SafeToPayAllocationInput {
  readonly orderedDebts: readonly Debt[];
  readonly safeToPay: SafeToPayResult;
}
export interface ExtraPaymentAllocation {
  readonly debt: Debt;
  readonly amount: Money;
  /** Coverage of the reported snapshot only, not payment or settlement status. */
  readonly coverage: 'full' | 'partial';
}
export interface SafeToPayAllocationResult {
  readonly allocations: readonly ExtraPaymentAllocation[];
  readonly totalAllocated: Money;
  readonly remainingSafeToPay: Money;
  readonly protectionStartDate: FinancialDate;
  readonly protectionThroughDate: FinancialDate;
}

/** Proposed extra payments in caller order; never executes or reconciles payments. */
export function allocateSafeToPay({ orderedDebts, safeToPay }: SafeToPayAllocationInput): SafeToPayAllocationResult {
  const budget = nonNegativeMoney(safeToPay.amount);
  const protectionStartDate = calendarDate(safeToPay.protectionStartDate);
  const protectionThroughDate = calendarDate(safeToPay.protectionThroughDate);
  if (protectionStartDate.compare(protectionThroughDate) > 0) throw new RangeError('Protection start must not be after its end.');

  // Validate the entire order before allocating, including beyond an exhausted budget.
  const seen = new Set<string>();
  const validated: { debt: Debt; balance: Money }[] = [];
  for (const debt of orderedDebts) {
    if (!(debt instanceof Debt)) throw new TypeError('Allocation entries must be Debt instances.');
    if (seen.has(debt.id)) throw new RangeError('Duplicate debt identity.');
    seen.add(debt.id);
    validated.push({ debt, balance: nonNegativeMoney(debt.balance) });
  }

  const allocations: ExtraPaymentAllocation[] = [];
  const zero = Money.zero('PHP');
  let remainingSafeToPay = budget;
  for (const { debt, balance } of validated) {
    if (remainingSafeToPay.equals(zero)) break;
    if (balance.equals(zero)) continue;
    const full = remainingSafeToPay.compare(balance) >= 0;
    const amount = full ? balance : remainingSafeToPay;
    allocations.push(Object.freeze({ debt, amount, coverage: full ? 'full' : 'partial' }));
    remainingSafeToPay = remainingSafeToPay.subtract(amount);
  }
  // Both operands stay within budget; never sum all reported debt balances.
  return Object.freeze({ allocations: Object.freeze(allocations),
    totalAllocated: budget.subtract(remainingSafeToPay), remainingSafeToPay,
    protectionStartDate, protectionThroughDate });
}
