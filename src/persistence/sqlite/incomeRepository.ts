import { Income } from '../../domain/Income';
import { incomeId, type IncomeId } from '../../domain/identifiers';
import type { FinancialConnection } from './connection';
import { guardedInteger, recurrenceSelection, recurrenceValues, storedDate, storedMoney,
  storedName, storedRecurrence, type FinancialRow } from './financialMapping';

export interface IncomeRepository {
  save(income: Income): Promise<void>;
  getById(id: IncomeId): Promise<Income | null>;
  list(): Promise<readonly Income[]>;
}

const selection = `SELECT id, name, currency, financial_date, status,
  ${guardedInteger('amount_minor_units')}, ${recurrenceSelection} FROM incomes`;

function validatedIncome(value: Omit<Income, 'status'> & { readonly status: unknown }): Income {
  if (value.status === 'expected') return Income.create({ ...value, status: 'expected' });
  if (value.status === 'received' && value.recurrence === undefined) {
    return Income.create({ ...value, status: 'received', recurrence: undefined });
  }
  throw new TypeError('Invalid income status or recurrence.');
}

function fromRow(row: FinancialRow): Income {
  return validatedIncome({ id: incomeId(row.id), name: storedName(row.name),
    amount: storedMoney(row.amount_minor_units, row.currency), date: storedDate(row.financial_date),
    status: row.status, recurrence: storedRecurrence(row) });
}

export function createIncomeRepository(db: FinancialConnection): IncomeRepository {
  return {
    async save(value) {
      if (!(value instanceof Income)) throw new TypeError('Expected an Income entity.');
      const income = validatedIncome(value);
      await db.runAsync(`INSERT INTO incomes (id, name, amount_minor_units, currency, financial_date,
        status, recurrence_kind, recurrence_day_1, recurrence_day_2) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET name = excluded.name, amount_minor_units = excluded.amount_minor_units,
        currency = excluded.currency, financial_date = excluded.financial_date, status = excluded.status,
        recurrence_kind = excluded.recurrence_kind, recurrence_day_1 = excluded.recurrence_day_1,
        recurrence_day_2 = excluded.recurrence_day_2`,
      income.id, income.name, income.amount.minorUnits, income.amount.currency, income.date.toString(),
      income.status, ...recurrenceValues(income.recurrence));
    },
    async getById(id) {
      const row = await db.getFirstAsync<FinancialRow>(`${selection} WHERE id = ?`, incomeId(id));
      return row === null ? null : fromRow(row);
    },
    async list() {
      return (await db.getAllAsync<FinancialRow>(`${selection} ORDER BY id COLLATE BINARY`)).map(fromRow);
    },
  };
}
