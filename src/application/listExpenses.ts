import type { EssentialObligation } from '../domain/EssentialObligation';
import type { FinancialConnection } from '../persistence/sqlite/connection';
import { openLayaDatabase } from '../persistence/sqlite/database';
import { createEssentialObligationRepository, type EssentialObligationRepository } from '../persistence/sqlite/essentialObligationRepository';

interface ListExpenseDependencies {
  open: () => Promise<FinancialConnection>;
  repository: (db: FinancialConnection) => Pick<EssentialObligationRepository, 'list'>;
}
const defaults: ListExpenseDependencies = { open: openLayaDatabase, repository: createEssentialObligationRepository };

/** One bounded read; caller receives entities only after owned cleanup succeeds. */
export async function listExpenses(dependencies: ListExpenseDependencies = defaults): Promise<readonly EssentialObligation[]> {
  const db = await dependencies.open();
  let expense: readonly EssentialObligation[];
  try {
    expense = await dependencies.repository(db).list();
  } catch (error) {
    try { await db.closeAsync(); } catch (closeError) {
      throw new AggregateError([error, closeError], 'EssentialObligation read and close failed.');
    }
    throw error;
  }
  await db.closeAsync();
  return expense;
}
