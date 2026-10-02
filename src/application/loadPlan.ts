import { calculateSafeToPay, type SafeToPayResult } from '../domain/calculateSafeToPay';
import type { Debt } from '../domain/Debt';
import type { FinancialDate } from '../domain/FinancialDate';
import { generateFinancialEvents } from '../domain/generateFinancialEvents';
import { Money } from '../domain/Money';
import { projectCashFlow } from '../domain/projectCashFlow';
import { withFinancialSnapshot, type FinancialSnapshotDependencies } from './withFinancialSnapshot';

export interface PlanResult {
  readonly startDate: FinancialDate;
  readonly through: FinancialDate;
  readonly debts: readonly Debt[];
  readonly recordedDebtCount: number;
  readonly totalReportedDebt: Money;
  readonly scheduledDueCount: number;
  readonly totalScheduledDues: Money;
  readonly recordedPaymentCount: number;
  readonly context: Readonly<{ kind: 'missing-available-money' }> | Readonly<{
    kind: 'ready'; availableMoney: Money; safeToPay: SafeToPayResult;
    lowestProjected: Money; endingProjected: Money;
  }>;
}
interface PlanDependencies extends FinancialSnapshotDependencies {
  generate: typeof generateFinancialEvents;
  project: typeof projectCashFlow;
}

/** Factual snapshots and schedules only: never subtract payments or allocate money. */
export async function loadPlan(overrides: Partial<PlanDependencies> = {}): Promise<PlanResult> {
  const deps = { generate: generateFinancialEvents, project: projectCashFlow, ...overrides };
  return withFinancialSnapshot(({ startDate, through, available, debts, incomes, essentialObligations, debtPayments }) => {
    let totalReportedDebt = Money.zero('PHP');
    for (const debt of debts) totalReportedDebt = totalReportedDebt.add(debt.balance);
    const events = deps.generate({ from: startDate, through, debts, incomes, essentialObligations, debtPayments });
    let totalScheduledDues = Money.zero('PHP');
    let scheduledDueCount = 0;
    // Same exclusive-start/inclusive-end window even without Available Money.
    for (const event of events) {
      if (event.kind === 'debt-due' && event.date.compare(startDate) > 0 && event.date.compare(through) <= 0) {
        totalScheduledDues = totalScheduledDues.add(event.amount);
        scheduledDueCount++;
      }
    }
    let context: PlanResult['context'] = Object.freeze({ kind: 'missing-available-money' });
    if (available !== null) {
      const projection = deps.project({ startingBalance: available.amount, startDate, through, events });
      context = Object.freeze({ kind: 'ready', availableMoney: projection.start.balance,
        safeToPay: calculateSafeToPay(projection), lowestProjected: projection.minimumProjectedBalance,
        endingProjected: projection.endingBalance });
    }
    return Object.freeze({ startDate, through, debts: Object.freeze([...debts]), recordedDebtCount: debts.length,
      totalReportedDebt, scheduledDueCount, totalScheduledDues, recordedPaymentCount: debtPayments.length, context });
  }, overrides);
}
