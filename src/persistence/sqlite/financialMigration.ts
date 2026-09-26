import type { SQLiteConnection } from './connection';

// Migration 3 is immutable history, including its constraints.
export async function createFinancialTables(db: SQLiteConnection): Promise<void> {
  await db.execAsync(`CREATE TABLE debts (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        provider TEXT,
        balance_minor_units INTEGER NOT NULL CHECK (typeof(balance_minor_units) = 'integer'
          AND balance_minor_units BETWEEN 0 AND 9007199254740991),
        currency TEXT NOT NULL CHECK (currency = 'PHP'),
        scheduled_payment_minor_units INTEGER CHECK (scheduled_payment_minor_units IS NULL
          OR (typeof(scheduled_payment_minor_units) = 'integer'
            AND scheduled_payment_minor_units BETWEEN 0 AND 9007199254740991)),
        next_due_date TEXT,
        interest_kind TEXT NOT NULL CHECK (interest_kind IN ('unknown', 'known')),
        interest_basis_points INTEGER,
        interest_period TEXT,
        recurrence_kind TEXT,
        recurrence_day_1 INTEGER,
        recurrence_day_2 INTEGER,
        CHECK (
          (recurrence_kind IS NULL AND recurrence_day_1 IS NULL AND recurrence_day_2 IS NULL)
          OR (recurrence_kind IS NOT NULL AND recurrence_kind = 'monthly'
            AND typeof(recurrence_day_1) = 'integer' AND recurrence_day_1 BETWEEN 1 AND 31
            AND recurrence_day_2 IS NULL)
          OR (recurrence_kind IS NOT NULL AND recurrence_kind = 'twice-monthly'
            AND typeof(recurrence_day_1) = 'integer' AND recurrence_day_1 BETWEEN 1 AND 31
            AND typeof(recurrence_day_2) = 'integer' AND recurrence_day_2 BETWEEN 1 AND 31
            AND recurrence_day_1 < recurrence_day_2)
        ),
        CHECK (
          (interest_kind = 'unknown' AND interest_basis_points IS NULL AND interest_period IS NULL)
          OR (interest_kind = 'known' AND typeof(interest_basis_points) = 'integer'
            AND interest_basis_points BETWEEN 0 AND 9007199254740991
            AND interest_period IS NOT NULL AND interest_period IN ('monthly', 'annual'))
        )
      );
      CREATE TABLE incomes (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        amount_minor_units INTEGER NOT NULL CHECK (typeof(amount_minor_units) = 'integer'
          AND amount_minor_units BETWEEN 0 AND 9007199254740991),
        currency TEXT NOT NULL CHECK (currency = 'PHP'),
        financial_date TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('expected', 'received')),
        recurrence_kind TEXT,
        recurrence_day_1 INTEGER,
        recurrence_day_2 INTEGER,
        CHECK (
          (recurrence_kind IS NULL AND recurrence_day_1 IS NULL AND recurrence_day_2 IS NULL)
          OR (recurrence_kind IS NOT NULL AND recurrence_kind = 'monthly'
            AND typeof(recurrence_day_1) = 'integer' AND recurrence_day_1 BETWEEN 1 AND 31
            AND recurrence_day_2 IS NULL)
          OR (recurrence_kind IS NOT NULL AND recurrence_kind = 'twice-monthly'
            AND typeof(recurrence_day_1) = 'integer' AND recurrence_day_1 BETWEEN 1 AND 31
            AND typeof(recurrence_day_2) = 'integer' AND recurrence_day_2 BETWEEN 1 AND 31
            AND recurrence_day_1 < recurrence_day_2)
        ),
        CHECK (status = 'expected' OR recurrence_kind IS NULL)
      );
      CREATE TABLE essential_obligations (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        amount_minor_units INTEGER NOT NULL CHECK (typeof(amount_minor_units) = 'integer'
          AND amount_minor_units BETWEEN 0 AND 9007199254740991),
        currency TEXT NOT NULL CHECK (currency = 'PHP'),
        financial_date TEXT NOT NULL,
        recurrence_kind TEXT,
        recurrence_day_1 INTEGER,
        recurrence_day_2 INTEGER,
        CHECK (
          (recurrence_kind IS NULL AND recurrence_day_1 IS NULL AND recurrence_day_2 IS NULL)
          OR (recurrence_kind IS NOT NULL AND recurrence_kind = 'monthly'
            AND typeof(recurrence_day_1) = 'integer' AND recurrence_day_1 BETWEEN 1 AND 31
            AND recurrence_day_2 IS NULL)
          OR (recurrence_kind IS NOT NULL AND recurrence_kind = 'twice-monthly'
            AND typeof(recurrence_day_1) = 'integer' AND recurrence_day_1 BETWEEN 1 AND 31
            AND typeof(recurrence_day_2) = 'integer' AND recurrence_day_2 BETWEEN 1 AND 31
            AND recurrence_day_1 < recurrence_day_2)
        )
      );
      CREATE TABLE debt_payments (
        id TEXT PRIMARY KEY NOT NULL,
        debt_id TEXT NOT NULL REFERENCES debts(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
        amount_minor_units INTEGER NOT NULL CHECK (typeof(amount_minor_units) = 'integer'
          AND amount_minor_units BETWEEN 1 AND 9007199254740991),
        currency TEXT NOT NULL CHECK (currency = 'PHP'),
        financial_date TEXT NOT NULL
      );
      CREATE INDEX debt_payments_debt_id ON debt_payments(debt_id)`);
}

