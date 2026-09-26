import { Debt, type Interest } from '../../domain/Debt';
import { debtId, type DebtId } from '../../domain/identifiers';
import type { FinancialConnection } from './connection';
import { guardedInteger, recurrenceSelection, recurrenceValues, storedDate, storedMoney,
  storedName, storedRecurrence, type FinancialRow } from './financialMapping';

export interface DebtRepository {
  save(debt: Debt): Promise<void>;
  getById(id: DebtId): Promise<Debt | null>;
  list(): Promise<readonly Debt[]>;
}

const selection = `SELECT id, name, provider, currency, next_due_date, interest_kind, interest_period,
  ${guardedInteger('balance_minor_units')}, ${guardedInteger('scheduled_payment_minor_units')},
  ${guardedInteger('interest_basis_points')}, ${recurrenceSelection} FROM debts`;

function fromRow(row: FinancialRow): Debt {
  let interest: Interest;
  if (row.interest_kind === 'unknown' && row.interest_basis_points === null && row.interest_period === null) {
    interest = { kind: 'unknown' };
  } else if (row.interest_kind === 'known' && typeof row.interest_basis_points === 'number' &&
      (row.interest_period === 'monthly' || row.interest_period === 'annual')) {
    interest = { kind: 'known', basisPoints: row.interest_basis_points, period: row.interest_period };
  } else {
    throw new TypeError('Invalid stored interest.');
  }
  return Debt.create({ id: debtId(row.id), name: storedName(row.name),
    provider: row.provider === null ? undefined : storedName(row.provider),
    balance: storedMoney(row.balance_minor_units, row.currency),
    scheduledPayment: row.scheduled_payment_minor_units === null ? undefined
      : storedMoney(row.scheduled_payment_minor_units, row.currency),
    nextDueDate: row.next_due_date === null ? undefined : storedDate(row.next_due_date),
    recurrence: storedRecurrence(row), interest });
}

export function createDebtRepository(db: FinancialConnection): DebtRepository {
  return {
    async save(value) {
      if (!(value instanceof Debt)) throw new TypeError('Expected a Debt entity.');
      const debt = Debt.create(value);
      await db.runAsync(`INSERT INTO debts (id, name, provider, balance_minor_units, currency,
        scheduled_payment_minor_units, next_due_date, interest_kind, interest_basis_points,
        interest_period, recurrence_kind, recurrence_day_1, recurrence_day_2)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET name = excluded.name, provider = excluded.provider,
        balance_minor_units = excluded.balance_minor_units, currency = excluded.currency,
        scheduled_payment_minor_units = excluded.scheduled_payment_minor_units,
        next_due_date = excluded.next_due_date, interest_kind = excluded.interest_kind,
        interest_basis_points = excluded.interest_basis_points, interest_period = excluded.interest_period,
        recurrence_kind = excluded.recurrence_kind, recurrence_day_1 = excluded.recurrence_day_1,
        recurrence_day_2 = excluded.recurrence_day_2`,
      debt.id, debt.name, debt.provider ?? null, debt.balance.minorUnits, debt.balance.currency,
      debt.scheduledPayment?.minorUnits ?? null, debt.nextDueDate?.toString() ?? null,
      debt.interest.kind, debt.interest.kind === 'known' ? debt.interest.basisPoints : null,
      debt.interest.kind === 'known' ? debt.interest.period : null, ...recurrenceValues(debt.recurrence));
    },
    async getById(id) {
      const row = await db.getFirstAsync<FinancialRow>(`${selection} WHERE id = ?`, debtId(id));
      return row === null ? null : fromRow(row);
    },
    async list() {
      return (await db.getAllAsync<FinancialRow>(`${selection} ORDER BY id COLLATE BINARY`)).map(fromRow);
    },
  };
}
