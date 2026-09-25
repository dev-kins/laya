import { FinancialDate } from '../../domain/FinancialDate';
import { Money } from '../../domain/Money';
import type { SQLiteConnection } from './connection';
import { migrations, runMigrations, type Migration } from './migrations';
import { readProbe, writeProbe } from './probe';

function check(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function mustReject(action: () => Promise<unknown>): Promise<void> {
  let rejected = false;
  try { await action(); } catch { rejected = true; }
  check(rejected, 'Expected validation operation to reject.');
}

/** Shared integration assertions, never imported by application startup.
 * Caller owns a fresh disposable database and its cleanup. This deliberately
 * injects corrupt synthetic rows; NEVER pass the normal application database.
 */
export async function validateSQLite(open: () => Promise<SQLiteConnection>) {
  let db = await open();
  let ownsConnection = true;
  const closeOwnedConnection = async (): Promise<void> => {
    if (!ownsConnection) return;
    // Transfer ownership before awaiting close, including when close rejects.
    ownsConnection = false;
    await db.closeAsync();
  };
  try {
    const foreignKeys = await db.getFirstAsync<{ foreign_keys: number }>('PRAGMA foreign_keys');
    const journal = await db.getFirstAsync<{ journal_mode: string }>('PRAGMA journal_mode');
    check(foreignKeys?.foreign_keys === 1, 'Foreign keys are disabled.');
    check(journal?.journal_mode === 'wal', 'File database did not enable WAL.');
    await db.execAsync(`CREATE TEMP TABLE validation_parent (id INTEGER PRIMARY KEY);
      CREATE TEMP TABLE validation_child (parent_id INTEGER REFERENCES validation_parent(id))`);
    await mustReject(() => db.execAsync('INSERT INTO validation_child VALUES (1)'));
    const date = FinancialDate.parse('2026-09-30');
    const amounts = [176425, -176425, 0, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER];
    for (const [index, amount] of amounts.entries()) {
      await writeProbe(db, `probe-${index}`, Money.fromMinorUnits(amount, 'PHP'), date);
    }
    await closeOwnedConnection();
    db = await open();
    ownsConnection = true;
    check((await db.getFirstAsync<{ foreign_keys: number }>('PRAGMA foreign_keys'))?.foreign_keys === 1,
      'Reopened connection lost foreign-key enforcement.');
    for (const [index, amount] of amounts.entries()) {
      const value = await readProbe(db, `probe-${index}`);
      check(value?.money.equals(Money.fromMinorUnits(amount, 'PHP')) === true, 'Money round trip failed.');
      check(value.date.equals(date), 'Date round trip failed.');
    }
    check(await readProbe(db, 'missing') === null, 'Missing row must return null.');

    const failed: Migration = { version: 2, async up(connection) {
      await connection.execAsync('CREATE TABLE rollback_probe (id INTEGER)');
      await connection.execAsync("UPDATE infrastructure_probe SET minor_units = 1 WHERE id = 'probe-0'");
      await connection.execAsync('INSERT INTO nonexistent_failure_probe VALUES (1)');
    } };
    await mustReject(() => runMigrations(db, [...migrations, failed]));
    const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    check(version?.user_version === 1, 'Failed migration advanced schema version.');
    check(await db.getFirstAsync("SELECT name FROM sqlite_master WHERE name = 'rollback_probe'") === null,
      'Failed migration left partial schema.');
    check((await readProbe(db, 'probe-0'))?.money.minorUnits === 176425, 'Failed migration changed prior data.');
    await closeOwnedConnection();
    db = await open();
    ownsConnection = true;
    const retry: Migration = { version: 2, async up(connection) {
      await connection.execAsync('CREATE TABLE rollback_probe (id INTEGER)');
    } };
    await runMigrations(db, [...migrations, retry]);
    await runMigrations(db, [...migrations, retry]); // Must not run CREATE TABLE twice.
    const retried = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    check(retried?.user_version === 2, 'Reopened database could not retry migration.');
    await mustReject(() => runMigrations(db));
    check((await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))?.user_version === 2,
      'Newer schema rejection changed version.');

    await mustReject(() => db.execAsync(`INSERT INTO infrastructure_probe VALUES
      ('unsafe-constrained', 9007199254740993, 'PHP', '2026-09-30')`));
    // Test corrupted/legacy storage bypassing the fixture CHECK constraints.
    await db.execAsync('PRAGMA ignore_check_constraints = ON');
    try {
      await db.execAsync(`INSERT INTO infrastructure_probe VALUES
        ('bad-currency', 1, 'USD', '2026-09-30'),
        ('bad-date', 1, 'PHP', '2026-02-29'),
        ('unsafe', 9007199254740993, 'PHP', '2026-09-30'),
        ('underflow', -9007199254740993, 'PHP', '2026-09-30'),
        ('fraction', 0.5, 'PHP', '2026-09-30')`);
    } finally {
      await db.execAsync('PRAGMA ignore_check_constraints = OFF');
    }
    for (const id of ['bad-currency', 'bad-date', 'unsafe', 'underflow', 'fraction']) {
      await mustReject(() => readProbe(db, id));
    }
    const exact = await db.getFirstAsync<{ exact: string }>(
      "SELECT CAST(minor_units AS TEXT) AS exact FROM infrastructure_probe WHERE id = 'unsafe'",
    );
    check(exact?.exact === '9007199254740993', 'SQLite did not retain the exact 64-bit integer.');
    // Observe the driver without relying on its lossy/throwing behavior for safety.
    let rawInteger: 'driver-rejected' | 'unsafe-number' | 'unexpected' = 'driver-rejected';
    try {
      const raw = await db.getFirstAsync<{ value: unknown }>(
        "SELECT minor_units AS value FROM infrastructure_probe WHERE id = 'unsafe'",
      );
      rawInteger = typeof raw?.value === 'number' && !Number.isSafeInteger(raw.value)
        ? 'unsafe-number' : 'unexpected';
    } catch {
      rawInteger = 'driver-rejected';
    }
    check(rawInteger !== 'unexpected', 'Unexpected native integer representation; review adapter.');
    return { roundTrips: amounts.length, rollbackAndRetry: true, rawInteger };
  } finally {
    await closeOwnedConnection();
  }
}
