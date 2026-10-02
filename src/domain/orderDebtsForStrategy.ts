import { Debt, type Interest } from './Debt';

export type DebtStrategy = 'snowball' | 'avalanche';
export interface DebtStrategyInput {
  readonly strategy: DebtStrategy;
  readonly debts: readonly Debt[];
}
export interface DebtStrategyResult {
  readonly strategy: DebtStrategy;
  readonly orderedDebts: readonly Debt[];
}

/** Nominal annualized comparison rate only; never accrued/effective interest.
 * Convert BEFORE multiplying: valid monthly rates can exceed number's safe range.
 */
function comparisonRate(interest: Extract<Interest, { kind: 'known' }>): bigint {
  return BigInt(interest.basisPoints) * BigInt(interest.period === 'monthly' ? 12 : 1);
}

function balanceThenId(left: Debt, right: Debt): number {
  return left.balance.compare(right.balance) || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
}

function avalanche(left: Debt, right: Debt): number {
  if (left.interest.kind === 'known') {
    if (right.interest.kind === 'unknown') return -1;
    const leftRate = comparisonRate(left.interest), rightRate = comparisonRate(right.interest);
    if (leftRate !== rightRate) return leftRate > rightRate ? -1 : 1;
  } else if (right.interest.kind === 'known') return 1;
  return balanceThenId(left, right);
}

/** Orders validated immutable Debt instances only; no allocation or reconciliation. */
export function orderDebtsForStrategy({ strategy, debts }: DebtStrategyInput): DebtStrategyResult {
  if (strategy !== 'snowball' && strategy !== 'avalanche') throw new RangeError('Invalid debt strategy.');
  const seen = new Set<string>();
  for (const debt of debts) {
    if (!(debt instanceof Debt)) throw new TypeError('Strategy entries must be Debt instances.');
    if (seen.has(debt.id)) throw new RangeError('Duplicate debt identity.');
    seen.add(debt.id);
  }
  return Object.freeze({ strategy,
    orderedDebts: Object.freeze([...debts].sort(strategy === 'snowball' ? balanceThenId : avalanche)) });
}
