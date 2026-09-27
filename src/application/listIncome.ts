import type { Income } from '../domain/Income';
import type { FinancialConnection } from '../persistence/sqlite/connection';
import { openLayaDatabase } from '../persistence/sqlite/database';
import { createIncomeRepository, type IncomeRepository } from '../persistence/sqlite/incomeRepository';

interface ListIncomeDependencies {
  open: () => Promise<FinancialConnection>;
  repository: (db: FinancialConnection) => Pick<IncomeRepository, 'list'>;
}
const defaults: ListIncomeDependencies = { open: openLayaDatabase, repository: createIncomeRepository };

/** One bounded read; caller receives entities only after owned cleanup succeeds. */
export async function listIncome(dependencies: ListIncomeDependencies = defaults): Promise<readonly Income[]> {
  const db = await dependencies.open();
  let income: readonly Income[];
  try {
    income = await dependencies.repository(db).list();
  } catch (error) {
    try { await db.closeAsync(); } catch (closeError) {
      throw new AggregateError([error, closeError], 'Income read and close failed.');
    }
    throw error;
  }
  await db.closeAsync();
  return income;
}
