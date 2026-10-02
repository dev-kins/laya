import { FinancialDate } from '../../domain/FinancialDate';
import type { HomeResult } from '../loadHome';

// Opt-in manual mock for navigation tests unrelated to Home's data pipeline.
export const loadHome = jest.fn<Promise<HomeResult>, []>().mockResolvedValue({
  kind: 'missing-available-money', startDate: FinancialDate.parse('2026-10-02'), through: FinancialDate.parse('2026-12-01'),
});
