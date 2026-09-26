import type { SQLiteConnection } from './connection';

export interface Migration {
  readonly version: number;
  readonly up: (db: SQLiteConnection) => Promise<void>;
}

// Released migrations are immutable history. Add a new version to change schema.
export const migrations: readonly Migration[] = Object.freeze([
  Object.freeze({
    version: 1,
    async up(db: SQLiteConnection): Promise<void> {
      // Infrastructure only: deliberately not a debt, income, or payment model.
      await db.execAsync(`CREATE TABLE infrastructure_probe (
        id TEXT PRIMARY KEY NOT NULL,
        minor_units INTEGER NOT NULL
          CHECK (typeof(minor_units) = 'integer'
            AND minor_units BETWEEN -9007199254740991 AND 9007199254740991),
        currency TEXT NOT NULL CHECK (currency = 'PHP'),
        financial_date TEXT NOT NULL
      )`);
    },
  }),
  Object.freeze({
    version: 2,
    async up(db: SQLiteConnection): Promise<void> {
      await db.execAsync(`CREATE TABLE app_preferences (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      )`);
    },
  }),
]);

export function pendingMigrations(currentVersion: number, available: readonly Migration[]): readonly Migration[] {
  if (!Number.isInteger(currentVersion) || currentVersion < 0) {
    throw new Error('Invalid database schema version.');
  }
  available.forEach((migration, index) => {
    if (migration.version !== index + 1) {
      throw new Error('Migration versions must be contiguous and ordered from 1.');
    }
  });
  if (currentVersion > available.length) {
    throw new Error('Database schema is newer than this application supports.');
  }
  return available.slice(currentVersion);
}

/** Startup only, on an owned connection not yet exposed to repositories.
 * Explicit transactions keep foreign_keys on the same connection. Migration up
 * functions must not issue BEGIN/COMMIT/ROLLBACK or alter user_version themselves.
 */
export async function runMigrations(
  db: SQLiteConnection,
  available: readonly Migration[] = migrations,
): Promise<void> {
  pendingMigrations(0, available);
  while (true) {
    await db.execAsync('BEGIN EXCLUSIVE');
    try {
      const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
      if (!row) throw new Error('Unable to read database schema version.');
      const next = pendingMigrations(row.user_version, available)[0];
      if (!next) {
        await db.execAsync('COMMIT');
        return;
      }
      await next.up(db);
      // Version is validated above and comes only from source-controlled migrations.
      await db.execAsync(`PRAGMA user_version = ${next.version}`);
      await db.execAsync('COMMIT');
    } catch (error) {
      try {
        await db.execAsync('ROLLBACK');
      } catch (rollbackError) {
        throw new AggregateError([error, rollbackError], 'Migration and rollback failed.');
      }
      throw error;
    }
  }
}
