import type { SQLiteConnection } from './connection';
import { migrations, runMigrations, type Migration } from './migrations';

export async function initializeDatabase(
  db: SQLiteConnection,
  available: readonly Migration[] = migrations,
): Promise<void> {
  await db.execAsync('PRAGMA foreign_keys = ON');
  const foreignKeys = await db.getFirstAsync<{ foreign_keys: number }>('PRAGMA foreign_keys');
  if (foreignKeys?.foreign_keys !== 1) throw new Error('Foreign-key enforcement is unavailable.');
  // SQLite returns the actual mode (e.g. memory for an in-memory test database).
  const journal = await db.getFirstAsync<{ journal_mode: string }>('PRAGMA journal_mode = WAL');
  if (!journal || !['wal', 'memory', 'delete', 'truncate', 'persist'].includes(journal.journal_mode)) {
    throw new Error('Unable to establish a supported journal mode.');
  }
  await runMigrations(db, available);
}
