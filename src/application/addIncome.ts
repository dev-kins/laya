import { uuid } from 'expo-modules-core';

import { Income } from '../domain/Income';
import { incomeId, type IncomeId } from '../domain/identifiers';
import type { FinancialConnection } from '../persistence/sqlite/connection';
import { openLayaDatabase } from '../persistence/sqlite/database';
import { createIncomeRepository, type IncomeRepository } from '../persistence/sqlite/incomeRepository';
import { parseIncomeForm, type IncomeForm } from './incomeForm';

interface AddIncomeDependencies {
  open: () => Promise<FinancialConnection>;
  generateId: () => string;
  repository: (db: FinancialConnection) => Pick<IncomeRepository, 'save'>;
}
const defaults: AddIncomeDependencies = {
  open: openLayaDatabase,
  generateId: () => uuid.v4(),
  repository: createIncomeRepository,
};

/** One instance per form. Retain identity across retries, including a committed
 * write followed by a close failure; repository upsert then cannot duplicate it.
 */
export function createAddIncomeOperation(dependencies: AddIncomeDependencies = defaults) {
  let id: IncomeId | undefined;
  return async (form: IncomeForm): Promise<Income> => {
    const input = parseIncomeForm(form);
    id ??= incomeId(dependencies.generateId());
    const income = Income.create({ ...input, id });
    const db = await dependencies.open();
    try {
      await dependencies.repository(db).save(income);
    } catch (error) {
      try { await db.closeAsync(); } catch (closeError) {
        throw new AggregateError([error, closeError], 'Income operation and close failed.');
      }
      throw error;
    }
    await db.closeAsync();
    return income;
  };
}
