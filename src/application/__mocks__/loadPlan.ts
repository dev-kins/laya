import { FinancialDate } from '../../domain/FinancialDate';
import { Money } from '../../domain/Money';
import type { PlanResult } from '../loadPlan';

export const loadPlan = jest.fn<Promise<PlanResult>, []>().mockResolvedValue({
  startDate: FinancialDate.parse('2026-10-02'), through: FinancialDate.parse('2026-12-01'),
  debts: [], recordedDebtCount: 0, totalReportedDebt: Money.zero('PHP'),
  scheduledDueCount: 0, totalScheduledDues: Money.zero('PHP'), recordedPaymentCount: 0,
  context: { kind: 'missing-available-money' },
});
