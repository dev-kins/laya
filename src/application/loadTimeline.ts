import type { FinancialDate } from '../domain/FinancialDate';
import { generateFinancialEvents } from '../domain/generateFinancialEvents';
import { calendarDate } from '../domain/modelValidation';
import { projectCashFlow, type CashFlowPoint, type CashFlowProjection } from '../domain/projectCashFlow';
import { createAvailableMoneyRepository, type AvailableMoneyRepository } from '../persistence/sqlite/availableMoneyRepository';
import type { FinancialConnection } from '../persistence/sqlite/connection';
import { openLayaDatabase } from '../persistence/sqlite/database';
import { createDebtRepository, type DebtRepository } from '../persistence/sqlite/debtRepository';
import { createDebtPaymentRepository, type DebtPaymentRepository } from '../persistence/sqlite/debtPaymentRepository';
import { createEssentialObligationRepository, type EssentialObligationRepository } from '../persistence/sqlite/essentialObligationRepository';
import { createIncomeRepository, type IncomeRepository } from '../persistence/sqlite/incomeRepository';
import { deviceLocalFinancialDate, timelineThrough } from './timelineCalendar';

export interface TimelineRepositories {
  availableMoney: Pick<AvailableMoneyRepository, 'get'>;
  debts: Pick<DebtRepository, 'list'>;
  incomes: Pick<IncomeRepository, 'list'>;
  essentialObligations: Pick<EssentialObligationRepository, 'list'>;
  debtPayments: Pick<DebtPaymentRepository, 'list'>;
}
interface TimelineDependencies {
  today: () => FinancialDate;
  open: () => Promise<FinancialConnection>;
  repositories: (db: FinancialConnection) => TimelineRepositories;
  generate: typeof generateFinancialEvents;
  project: typeof projectCashFlow;
}
export interface TimelineEntry extends CashFlowPoint {
  readonly sourceName: string;
  readonly label: 'Expected income' | 'Essential expense' | 'Debt due';
}
export interface TimelineGroup {
  readonly date: FinancialDate;
  readonly entries: readonly TimelineEntry[];
}
export type TimelineResult =
  | Readonly<{ kind: 'missing-available-money'; startDate: FinancialDate; through: FinancialDate }>
  | Readonly<{ kind: 'ready'; projection: CashFlowProjection; groups: readonly TimelineGroup[] }>;

const defaults: TimelineDependencies = {
  today: deviceLocalFinancialDate, open: openLayaDatabase,
  repositories: db => ({ availableMoney: createAvailableMoneyRepository(db), debts: createDebtRepository(db),
    incomes: createIncomeRepository(db), essentialObligations: createEssentialObligationRepository(db),
    debtPayments: createDebtPaymentRepository(db) }),
  generate: generateFinancialEvents, project: projectCashFlow,
};

/** One owned initialized connection, one read snapshot, success only after close. */
export async function loadTimeline(overrides: Partial<TimelineDependencies> = {}): Promise<TimelineResult> {
  const deps = { ...defaults, ...overrides };
  const startDate = calendarDate(deps.today());
  const through = timelineThrough(startDate);
  const db = await deps.open();
  let transaction = false;
  let result: TimelineResult;
  try {
    const repos = deps.repositories(db);
    await db.execAsync('BEGIN DEFERRED');
    transaction = true;
    // Sequential reads keep failure/rollback from racing outstanding DB work.
    const available = await repos.availableMoney.get();
    const debts = await repos.debts.list();
    const incomes = await repos.incomes.list();
    const essentialObligations = await repos.essentialObligations.list();
    const debtPayments = await repos.debtPayments.list();
    await db.execAsync('COMMIT');
    transaction = false;

    if (available === null) result = Object.freeze({ kind: 'missing-available-money', startDate, through });
    else {
      const events = deps.generate({ from: startDate, through, debts, incomes, essentialObligations, debtPayments });
      const projection = deps.project({ startingBalance: available.amount, startDate, through, events });
      const debtNames = new Map<string, string>(debts.map(value => [value.id, value.name]));
      const incomeNames = new Map<string, string>(incomes.map(value => [value.id, value.name]));
      const expenseNames = new Map<string, string>(essentialObligations.map(value => [value.id, value.name]));
      const groups: { date: FinancialDate; entries: TimelineEntry[] }[] = [];
      for (const point of projection.points) {
        let sourceName: string | undefined;
        let label: TimelineEntry['label'];
        switch (point.event.kind) {
          case 'expected-income': sourceName = incomeNames.get(point.event.sourceId); label = 'Expected income'; break;
          case 'essential-due': sourceName = expenseNames.get(point.event.sourceId); label = 'Essential expense'; break;
          case 'debt-due': sourceName = debtNames.get(point.event.sourceId); label = 'Debt due'; break;
          default: throw new Error('Unexpected applied Timeline event.');
        }
        if (sourceName === undefined) throw new Error('Timeline event source is missing.');
        let group = groups[groups.length - 1];
        if (!group || !group.date.equals(point.event.date)) {
          group = { date: point.event.date, entries: [] }; groups.push(group);
        }
        group.entries.push(Object.freeze({ ...point, sourceName, label }));
      }
      result = Object.freeze({ kind: 'ready', projection,
        groups: Object.freeze(groups.map(group => Object.freeze({ date: group.date, entries: Object.freeze(group.entries) }))) });
    }
  } catch (error) {
    let failure = error;
    if (transaction) {
      try { await db.execAsync('ROLLBACK'); } catch (rollbackError) {
        failure = new AggregateError([failure, rollbackError], 'Timeline read and rollback failed.');
      }
    }
    try { await db.closeAsync(); } catch (closeError) {
      throw new AggregateError([failure, closeError], 'Timeline operation and close failed.');
    }
    throw failure;
  }
  await db.closeAsync();
  return result;
}
