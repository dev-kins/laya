import { openDatabaseAsync } from 'expo-sqlite';

import { initializeDatabase } from './initialize';

export const LAYA_DATABASE_NAME = 'laya.db';

/** Await once at application startup, then pass the returned connection to future
 * repositories. Do not repeatedly open/close it for operations. Explicit close is
 * for tests, shutdown, or development lifecycle; no global singleton is maintained.
 */
export async function openLayaDatabase(filename = LAYA_DATABASE_NAME) {
  const db = await openDatabaseAsync(filename, { useNewConnection: true });
  try {
    await initializeDatabase(db);
    return db;
  } catch (error) {
    try {
      await db.closeAsync();
    } catch (closeError) {
      throw new AggregateError([error, closeError], 'Database initialization and close failed.');
    }
    // Closing releases resources; it does not delete or reset the database.
    throw error;
  }
}
