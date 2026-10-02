import type { SafeToPayResult } from './calculateSafeToPay';
import type { Debt } from './Debt';
import { calendarDate, nonNegativeMoney } from './modelValidation';
import { Money } from './Money';
import { orderDebtsForStrategy } from './orderDebtsForStrategy';

export type LayaAdaptiveCategory = 'clearable-within-safe-to-pay' | 'remaining-avalanche-order';
export interface LayaAdaptiveInput {
  readonly debts: readonly Debt[];
  readonly safeToPay: SafeToPayResult;
}
export interface LayaAdaptiveEntry {
  readonly debt: Debt;
  readonly category: LayaAdaptiveCategory;
}
export interface LayaAdaptiveResult {
  readonly orderedEntries: readonly LayaAdaptiveEntry[];
}

/** Individual capacity classification only, never cumulative payment allocation.
 * Consumes upstream Safe-to-Pay without recalculating it or changing its window.
 */
export function orderDebtsForLayaAdaptive({ debts, safeToPay }: LayaAdaptiveInput): LayaAdaptiveResult {
  const amount = nonNegativeMoney(safeToPay.amount);
  const start = calendarDate(safeToPay.protectionStartDate);
  const through = calendarDate(safeToPay.protectionThroughDate);
  if (start.compare(through) > 0) throw new RangeError('Protection start must not be after its end.');
  // Validate identities across the WHOLE input before partitioning. Retain B's order.
  const avalanche = orderDebtsForStrategy({ strategy: 'avalanche', debts }).orderedDebts;
  const clearable: Debt[] = [];
  const remaining: LayaAdaptiveEntry[] = [];
  const zero = Money.zero('PHP');
  for (const debt of avalanche) {
    if (debt.balance.compare(zero) > 0 && debt.balance.compare(amount) <= 0) clearable.push(debt);
    else remaining.push(Object.freeze({ debt, category: 'remaining-avalanche-order' }));
  }
  const first = orderDebtsForStrategy({ strategy: 'snowball', debts: clearable }).orderedDebts;
  return Object.freeze({ orderedEntries: Object.freeze([
    ...first.map(debt => Object.freeze({ debt, category: 'clearable-within-safe-to-pay' as const })),
    ...remaining,
  ]) });
}
