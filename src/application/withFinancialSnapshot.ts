import type { AvailableMoney } from '../domain/AvailableMoney';
import type { Debt } from '../domain/Debt';
import type { DebtPayment } from '../domain/DebtPayment';
import type { EssentialObligation } from '../domain/EssentialObligation';
import type { FinancialDate } from '../domain/FinancialDate';
import type { Income } from '../domain/Income';
import { calendarDate } from '../domain/modelValidation';
import { createAvailableMoneyRepository, type AvailableMoneyRepository } from '../persistence/sqlite/availableMoneyRepository';
import type { FinancialConnection } from '../persistence/sqlite/connection';
import { openLayaDatabase } from '../persistence/sqlite/database';
import { createDebtRepository, type DebtRepository } from '../persistence/sqlite/debtRepository';
import { createDebtPaymentRepository, type DebtPaymentRepository } from '../persistence/sqlite/debtPaymentRepository';
import { createEssentialObligationRepository, type EssentialObligationRepository } from '../persistence/sqlite/essentialObligationRepository';
import { createIncomeRepository, type IncomeRepository } from '../persistence/sqlite/incomeRepository';
import { deviceLocalFinancialDate, timelineThrough } from './timelineCalendar';

export interface FinancialRepositories {
  availableMoney: Pick<AvailableMoneyRepository, 'get'>;
  debts: Pick<DebtRepository, 'list'>;
  incomes: Pick<IncomeRepository, 'list'>;
  essentialObligations: Pick<EssentialObligationRepository, 'list'>;
  debtPayments: Pick<DebtPaymentRepository, 'list'>;
}
export interface FinancialSnapshotDependencies {
  today: () => FinancialDate;
  open: () => Promise<FinancialConnection>;
  repositories: (db: FinancialConnection) => FinancialRepositories;
}
export interface FinancialSnapshot {
  readonly startDate: FinancialDate;
  readonly through: FinancialDate;
  readonly available: AvailableMoney | null;
  readonly debts: readonly Debt[];
  readonly incomes: readonly Income[];
  readonly essentialObligations: readonly EssentialObligation[];
  readonly debtPayments: readonly DebtPayment[];
}
const defaults: FinancialSnapshotDependencies = {
  today: deviceLocalFinancialDate, open: openLayaDatabase,
  repositories: db => ({ availableMoney: createAvailableMoneyRepository(db), debts: createDebtRepository(db),
    incomes: createIncomeRepository(db), essentialObligations: createEssentialObligationRepository(db),
    debtPayments: createDebtPaymentRepository(db) }),
};

/** Shared bounded read. Compose after COMMIT but before close so both failures survive. */
export async function withFinancialSnapshot<T>(compose: (snapshot: FinancialSnapshot) => T,
  overrides: Partial<FinancialSnapshotDependencies> = {}): Promise<T> {
  const deps = { ...defaults, ...overrides };
  const startDate = calendarDate(deps.today());
  const through = timelineThrough(startDate);
  const db = await deps.open();
  let transaction = false;
  let result: T;
  try {
    const repos = deps.repositories(db);
    await db.execAsync('BEGIN DEFERRED');
    transaction = true;
    // Sequential reads keep rollback from racing outstanding DB work.
    const available = await repos.availableMoney.get();
    const debts = await repos.debts.list();
    const incomes = await repos.incomes.list();
    const essentialObligations = await repos.essentialObligations.list();
    const debtPayments = await repos.debtPayments.list();
    await db.execAsync('COMMIT');
    transaction = false;
    result = compose({ startDate, through, available, debts, incomes, essentialObligations, debtPayments });
  } catch (error) {
    let failure = error;
    if (transaction) {
      try { await db.execAsync('ROLLBACK'); } catch (rollbackError) {
        failure = new AggregateError([failure, rollbackError], 'Financial read and rollback failed.');
      }
    }
    try { await db.closeAsync(); } catch (closeError) {
      throw new AggregateError([failure, closeError], 'Financial operation and close failed.');
    }
    throw failure;
  }
  await db.closeAsync();
  return result;
}
