import { FinancialDate } from '../../domain/FinancialDate';
import { Money } from '../../domain/Money';
import type { SQLiteConnection } from './connection';

export interface ProbeRow {
  minor_units: unknown;
  currency: unknown;
  financial_date: unknown;
}

export function decodeProbeRow(row: ProbeRow): { money: Money; date: FinancialDate } {
  return {
    money: Money.fromMinorUnits(row.minor_units, row.currency),
    date: FinancialDate.parse(row.financial_date),
  };
}

/** Synthetic infrastructure adapter only. Use an initialized connection. */
export async function writeProbe(db: SQLiteConnection, id: string, money: Money, date: FinancialDate): Promise<void> {
  const validatedMoney = Money.fromMinorUnits(money.minorUnits, money.currency);
  const validatedDate = FinancialDate.fromParts(date.year, date.month, date.day);
  await db.runAsync(
    'INSERT INTO infrastructure_probe (id, minor_units, currency, financial_date) VALUES (?, ?, ?, ?)',
    id, validatedMoney.minorUnits, validatedMoney.currency, validatedDate.toString(),
  );
}

export async function readProbe(db: SQLiteConnection, id: string) {
  const row = await db.getFirstAsync<ProbeRow>(
    `SELECT CASE WHEN typeof(minor_units) = 'integer'
      AND minor_units BETWEEN -9007199254740991 AND 9007199254740991
      THEN minor_units ELSE NULL END AS minor_units, currency, financial_date
     FROM infrastructure_probe WHERE id = ?`,
    id,
  );
  // SQLite's signed 64-bit range exceeds JS safe integers. Check in SQL BEFORE
  // crossing the native bridge. Money revalidates but cannot recover lost bits.
  return row ? decodeProbeRow(row) : null;
}
