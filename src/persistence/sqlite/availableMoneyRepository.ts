import { AvailableMoney } from '../../domain/AvailableMoney';
import type { FinancialConnection } from './connection';
import { guardedInteger, storedMoney, type FinancialRow } from './financialMapping';

export interface AvailableMoneyRepository {
  get(): Promise<AvailableMoney | null>;
  save(snapshot: AvailableMoney): Promise<void>;
}

export function createAvailableMoneyRepository(db: FinancialConnection): AvailableMoneyRepository {
  return {
    async get() {
      // Do not filter away malformed singleton IDs. Guard before driver conversion,
      // including the key; LIMIT 2 detects externally corrupted extra rows.
      const rows = await db.getAllAsync<FinancialRow>(`SELECT
        CASE WHEN singleton_id = 1 THEN 1 ELSE 'invalid-singleton' END AS singleton_id,
        ${guardedInteger('amount_minor_units')}, currency FROM available_money LIMIT 2`);
      if (rows.length === 0) return null;
      if (rows.length !== 1 || rows[0].singleton_id !== 1) throw new TypeError('Invalid available money singleton.');
      return AvailableMoney.create({ amount: storedMoney(rows[0].amount_minor_units, rows[0].currency) });
    },
    async save(value) {
      if (!(value instanceof AvailableMoney)) throw new TypeError('Expected an AvailableMoney snapshot.');
      const snapshot = AvailableMoney.create(value);
      await db.runAsync(`INSERT INTO available_money (singleton_id, amount_minor_units, currency) VALUES (1, ?, ?)
        ON CONFLICT(singleton_id) DO UPDATE SET amount_minor_units = excluded.amount_minor_units,
        currency = excluded.currency`, snapshot.amount.minorUnits, snapshot.amount.currency);
    },
  };
}
