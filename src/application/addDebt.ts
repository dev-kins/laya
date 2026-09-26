import { uuid } from 'expo-modules-core';

import { Debt } from '../domain/Debt';
import { debtId, type DebtId } from '../domain/identifiers';
import type { FinancialConnection } from '../persistence/sqlite/connection';
import { openLayaDatabase } from '../persistence/sqlite/database';
import { createDebtRepository, type DebtRepository } from '../persistence/sqlite/debtRepository';
import { parseDebtForm, type DebtForm } from './debtForm';

interface AddDebtDependencies {
  open: () => Promise<FinancialConnection>;
  generateId: () => string;
  repository: (db: FinancialConnection) => Pick<DebtRepository, 'save'>;
}
const defaults: AddDebtDependencies = {
  open: openLayaDatabase,
  generateId: () => uuid.v4(),
  repository: createDebtRepository,
};

/** One instance per form. Retain identity across retries, including a committed
 * write followed by a close failure; repository upsert then cannot duplicate it.
 */
export function createAddDebtOperation(dependencies: AddDebtDependencies = defaults) {
  let id: DebtId | undefined;
  return async (form: DebtForm): Promise<Debt> => {
    const input = parseDebtForm(form);
    id ??= debtId(dependencies.generateId());
    const debt = Debt.create({ ...input, id });
    const db = await dependencies.open();
    try {
      await dependencies.repository(db).save(debt);
    } catch (error) {
      try { await db.closeAsync(); } catch (closeError) {
        throw new AggregateError([error, closeError], 'Debt operation and close failed.');
      }
      throw error;
    }
    await db.closeAsync();
    return debt;
  };
}
