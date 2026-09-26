import type { Debt } from '../domain/Debt';
import type { FinancialConnection } from '../persistence/sqlite/connection';
import { openLayaDatabase } from '../persistence/sqlite/database';
import { createDebtRepository, type DebtRepository } from '../persistence/sqlite/debtRepository';

interface ListDebtsDependencies {
  open: () => Promise<FinancialConnection>;
  repository: (db: FinancialConnection) => Pick<DebtRepository, 'list'>;
}
const defaults: ListDebtsDependencies = { open: openLayaDatabase, repository: createDebtRepository };

/** One bounded read; caller receives entities only after owned cleanup succeeds. */
export async function listDebts(dependencies: ListDebtsDependencies = defaults): Promise<readonly Debt[]> {
  const db = await dependencies.open();
  let debts: readonly Debt[];
  try {
    debts = await dependencies.repository(db).list();
  } catch (error) {
    try { await db.closeAsync(); } catch (closeError) {
      throw new AggregateError([error, closeError], 'Debt read and close failed.');
    }
    throw error;
  }
  await db.closeAsync();
  return debts;
}
