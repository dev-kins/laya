import { uuid } from 'expo-modules-core';

import { EssentialObligation } from '../domain/EssentialObligation';
import { obligationId, type ObligationId } from '../domain/identifiers';
import type { FinancialConnection } from '../persistence/sqlite/connection';
import { openLayaDatabase } from '../persistence/sqlite/database';
import { createEssentialObligationRepository, type EssentialObligationRepository } from '../persistence/sqlite/essentialObligationRepository';
import { parseExpenseForm, type ExpenseForm } from './expenseForm';

interface AddExpenseDependencies {
  open: () => Promise<FinancialConnection>;
  generateId: () => string;
  repository: (db: FinancialConnection) => Pick<EssentialObligationRepository, 'save'>;
}
const defaults: AddExpenseDependencies = {
  open: openLayaDatabase,
  generateId: () => uuid.v4(),
  repository: createEssentialObligationRepository,
};

/** One instance per form. Retain identity across retries, including a committed
 * write followed by a close failure; repository upsert then cannot duplicate it.
 */
export function createAddExpenseOperation(dependencies: AddExpenseDependencies = defaults) {
  let id: ObligationId | undefined;
  return async (form: ExpenseForm): Promise<EssentialObligation> => {
    const input = parseExpenseForm(form);
    id ??= obligationId(dependencies.generateId());
    const expense = EssentialObligation.create({ ...input, id });
    const db = await dependencies.open();
    try {
      await dependencies.repository(db).save(expense);
    } catch (error) {
      try { await db.closeAsync(); } catch (closeError) {
        throw new AggregateError([error, closeError], 'EssentialObligation operation and close failed.');
      }
      throw error;
    }
    await db.closeAsync();
    return expense;
  };
}
