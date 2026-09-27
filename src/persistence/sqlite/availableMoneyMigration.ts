import type { SQLiteConnection } from './connection';

// Migration 4: zero or one current snapshot; no default row and no history.
export async function createAvailableMoneyTable(db: SQLiteConnection): Promise<void> {
  await db.execAsync(`CREATE TABLE available_money (
    singleton_id INTEGER PRIMARY KEY NOT NULL CHECK (singleton_id = 1),
    amount_minor_units INTEGER NOT NULL CHECK (typeof(amount_minor_units) = 'integer'
      AND amount_minor_units BETWEEN 0 AND 9007199254740991),
    currency TEXT NOT NULL CHECK (currency = 'PHP')
  )`);
}
