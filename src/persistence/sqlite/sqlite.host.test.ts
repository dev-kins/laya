/// <reference types="node" />
// REAL desktop SQLite via Node, not Expo SQLite and not native Android validation.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import type { SQLiteConnection, SqlValue } from './connection';
import { initializeDatabase } from './initialize';
import { validateSQLite } from './validation';

test('host SQLite: migrations, rollback/retry, persistence, corruption, and integer boundaries', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'laya-sqlite-validation-'));
  const filename = join(directory, 'probe.db');
  const open = async (): Promise<SQLiteConnection> => {
    const native = new DatabaseSync(filename);
    const db: SQLiteConnection = {
      async execAsync(sql) { native.exec(sql); },
      async getFirstAsync<T>(sql: string, ...params: SqlValue[]): Promise<T | null> {
        return (native.prepare(sql).get(...params) as T | undefined) ?? null;
      },
      async runAsync(sql, ...params) { return native.prepare(sql).run(...params); },
      async closeAsync() { native.close(); },
    };
    try { await initializeDatabase(db); } catch (error) { native.close(); throw error; }
    return db;
  };
  try {
    await expect(validateSQLite(open)).resolves.toEqual({
      roundTrips: 5, rollbackAndRetry: true, rawInteger: 'driver-rejected',
    });
  } finally {
    // Only this test's newly allocated temporary directory, never application data.
    rmSync(directory, { recursive: true, force: true });
  }
});
