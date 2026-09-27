import { AvailableMoney } from '../domain/AvailableMoney';
import { Money } from '../domain/Money';
import { createAvailableMoneyRepository, type AvailableMoneyRepository } from '../persistence/sqlite/availableMoneyRepository';
import type { FinancialConnection } from '../persistence/sqlite/connection';
import { openLayaDatabase } from '../persistence/sqlite/database';

export class AvailableMoneyFormError extends Error {
  constructor() {
    super('Enter a non-negative PHP amount with up to 2 decimal places, within the supported range.');
  }
}
export function parseAvailableMoney(text: string): AvailableMoney {
  try { return AvailableMoney.create({ amount: Money.parse(text, 'PHP') }); }
  catch { throw new AvailableMoneyFormError(); }
}

interface AvailableMoneyDependencies {
  open: () => Promise<FinancialConnection>;
  repository: (db: FinancialConnection) => AvailableMoneyRepository;
}
const defaults: AvailableMoneyDependencies = { open: openLayaDatabase, repository: createAvailableMoneyRepository };

// Shared only by this feature's two bounded operations; repositories do not own
// connections and successful results are withheld until cleanup completes.
async function withRepository<T>(dependencies: AvailableMoneyDependencies, operation: (repo: AvailableMoneyRepository) => Promise<T>): Promise<T> {
  const db = await dependencies.open();
  let result: T;
  try { result = await operation(dependencies.repository(db)); }
  catch (error) {
    try { await db.closeAsync(); } catch (closeError) {
      throw new AggregateError([error, closeError], 'Available money operation and close failed.');
    }
    throw error;
  }
  await db.closeAsync();
  return result;
}

export function readAvailableMoney(dependencies: AvailableMoneyDependencies = defaults): Promise<AvailableMoney | null> {
  return withRepository(dependencies, repo => repo.get());
}

export async function saveAvailableMoney(text: string, dependencies: AvailableMoneyDependencies = defaults): Promise<AvailableMoney> {
  const snapshot = parseAvailableMoney(text);
  return withRepository(dependencies, async repo => { await repo.save(snapshot); return snapshot; });
}
