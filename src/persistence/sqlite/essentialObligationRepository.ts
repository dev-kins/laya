import { EssentialObligation } from '../../domain/EssentialObligation';
import { obligationId, type ObligationId } from '../../domain/identifiers';
import type { FinancialConnection } from './connection';
import { guardedInteger, recurrenceSelection, recurrenceValues, storedDate, storedMoney,
  storedName, storedRecurrence, type FinancialRow } from './financialMapping';

export interface EssentialObligationRepository {
  save(obligation: EssentialObligation): Promise<void>;
  getById(id: ObligationId): Promise<EssentialObligation | null>;
  list(): Promise<readonly EssentialObligation[]>;
}

const selection = `SELECT id, name, currency, financial_date,
  ${guardedInteger('amount_minor_units')}, ${recurrenceSelection} FROM essential_obligations`;

function fromRow(row: FinancialRow): EssentialObligation {
  return EssentialObligation.create({ id: obligationId(row.id), name: storedName(row.name),
    amount: storedMoney(row.amount_minor_units, row.currency), date: storedDate(row.financial_date),
    recurrence: storedRecurrence(row) });
}

export function createEssentialObligationRepository(db: FinancialConnection): EssentialObligationRepository {
  return {
    async save(value) {
      if (!(value instanceof EssentialObligation)) throw new TypeError('Expected an EssentialObligation entity.');
      const obligation = EssentialObligation.create(value);
      await db.runAsync(`INSERT INTO essential_obligations (id, name, amount_minor_units, currency,
        financial_date, recurrence_kind, recurrence_day_1, recurrence_day_2) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET name = excluded.name, amount_minor_units = excluded.amount_minor_units,
        currency = excluded.currency, financial_date = excluded.financial_date,
        recurrence_kind = excluded.recurrence_kind, recurrence_day_1 = excluded.recurrence_day_1,
        recurrence_day_2 = excluded.recurrence_day_2`,
      obligation.id, obligation.name, obligation.amount.minorUnits, obligation.amount.currency,
      obligation.date.toString(), ...recurrenceValues(obligation.recurrence));
    },
    async getById(id) {
      const row = await db.getFirstAsync<FinancialRow>(`${selection} WHERE id = ?`, obligationId(id));
      return row === null ? null : fromRow(row);
    },
    async list() {
      return (await db.getAllAsync<FinancialRow>(`${selection} ORDER BY id COLLATE BINARY`)).map(fromRow);
    },
  };
}
