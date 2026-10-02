import { allocateSafeToPay, type SafeToPayAllocationResult } from '../domain/allocateSafeToPay';
import type { SafeToPayResult } from '../domain/calculateSafeToPay';
import type { Debt } from '../domain/Debt';
import { orderDebtsForLayaAdaptive, type LayaAdaptiveCategory } from '../domain/orderDebtsForLayaAdaptive';
import { orderDebtsForStrategy } from '../domain/orderDebtsForStrategy';

export type PlanStrategy = 'snowball' | 'avalanche' | 'adaptive';
export interface PlanStrategyEntry {
  readonly debt: Debt;
  readonly category?: LayaAdaptiveCategory;
}
export interface PlanStrategyScenario {
  readonly safeToPay: SafeToPayResult;
  readonly orderedEntries: readonly PlanStrategyEntry[];
  readonly allocation: SafeToPayAllocationResult;
}
export type PlanStrategies = Readonly<Record<PlanStrategy, PlanStrategyScenario>>;

/** One already-computed capacity, three alternative views; no financial algorithms. */
export function composePlanStrategies(debts: readonly Debt[], safeToPay: SafeToPayResult): PlanStrategies {
  function scenario(orderedEntries: readonly PlanStrategyEntry[]): PlanStrategyScenario {
    return Object.freeze({ safeToPay, orderedEntries,
      allocation: allocateSafeToPay({ orderedDebts: orderedEntries.map(entry => entry.debt), safeToPay }) });
  }
  function conventional(strategy: 'snowball' | 'avalanche') {
    return scenario(Object.freeze(orderDebtsForStrategy({ strategy, debts }).orderedDebts.map(debt => Object.freeze({ debt }))));
  }
  return Object.freeze({ snowball: conventional('snowball'), avalanche: conventional('avalanche'),
    adaptive: scenario(orderDebtsForLayaAdaptive({ debts, safeToPay }).orderedEntries) });
}
