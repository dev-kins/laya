import type { FinancialDate } from '../domain/FinancialDate';
import { generateFinancialEvents } from '../domain/generateFinancialEvents';
import { projectCashFlow, type CashFlowPoint, type CashFlowProjection } from '../domain/projectCashFlow';
import { withFinancialSnapshot, type FinancialRepositories, type FinancialSnapshotDependencies } from './withFinancialSnapshot';

export type TimelineRepositories = FinancialRepositories;
interface TimelineDependencies extends FinancialSnapshotDependencies {
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

const defaults = {
  generate: generateFinancialEvents, project: projectCashFlow,
};

/** One owned initialized connection, one read snapshot, success only after close. */
export async function loadTimeline(overrides: Partial<TimelineDependencies> = {}): Promise<TimelineResult> {
  const deps = { ...defaults, ...overrides };
  return withFinancialSnapshot<TimelineResult>(({ startDate, through, available, debts, incomes, essentialObligations, debtPayments }) => {
    if (available === null) return Object.freeze({ kind: 'missing-available-money', startDate, through });
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
      return Object.freeze({ kind: 'ready', projection,
        groups: Object.freeze(groups.map(group => Object.freeze({ date: group.date, entries: Object.freeze(group.entries) }))) });
    }
  }, overrides);
}
