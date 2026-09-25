import { FinancialDate } from '../../domain/FinancialDate';
import { Money } from '../../domain/Money';
import type { SQLiteConnection } from './connection';
import { initializeDatabase } from './initialize';
import { migrations, pendingMigrations, runMigrations, type Migration } from './migrations';
import { decodeProbeRow, readProbe, writeProbe } from './probe';

// Control-flow doubles only. These tests do NOT prove SQL or transaction semantics.
function connection(version = 0) {
  const execAsync = jest.fn(async (_sql: string): Promise<void> => {});
  const getFirstAsync = jest.fn(async (sql: string): Promise<unknown> => {
    if (sql === 'PRAGMA user_version') return { user_version: version };
    if (sql === 'PRAGMA foreign_keys') return { foreign_keys: 1 };
    if (sql === 'PRAGMA journal_mode = WAL') return { journal_mode: 'wal' };
    return null;
  });
  const runAsync = jest.fn(async (): Promise<unknown> => undefined);
  const closeAsync = jest.fn(async (): Promise<void> => {});
  const db: SQLiteConnection = {
    execAsync, runAsync, closeAsync,
    getFirstAsync: getFirstAsync as SQLiteConnection['getFirstAsync'],
  };
  return { db, execAsync, getFirstAsync, runAsync, closeAsync };
}

describe('migration selection and failure control flow (unit doubles)', () => {
  test('selects only pending migrations', () => {
    expect(pendingMigrations(0, migrations)).toEqual(migrations);
    expect(pendingMigrations(1, migrations)).toEqual([]);
    expect(pendingMigrations(0, [])).toEqual([]);
  });

  test.each([-1, 0.5, NaN, Infinity, 2])('rejects invalid or newer version %s', (version) => {
    expect(() => pendingMigrations(version, migrations)).toThrow();
  });

  test.each([[2], [1, 3], [1, 1], [2, 1], [0], [1.5]])('rejects invalid migration sequence %j', (...versions) => {
    const available = versions.map((version) => ({ version, up: async () => {} }));
    expect(() => pendingMigrations(0, available)).toThrow();
  });

  test('does not rerun an applied migration', async () => {
    const { db, execAsync } = connection(1);
    const up = jest.fn(async () => {});
    await runMigrations(db, [{ version: 1, up }]);
    expect(up).not.toHaveBeenCalled();
    expect(execAsync.mock.calls.map(([sql]) => sql)).toEqual(['BEGIN EXCLUSIVE', 'COMMIT']);
  });

  test('runs migration and version update within one transaction', async () => {
    const { db, execAsync, getFirstAsync } = connection();
    getFirstAsync.mockResolvedValueOnce({ user_version: 0 }).mockResolvedValueOnce({ user_version: 1 });
    await runMigrations(db, [{ version: 1, up: async (tx) => tx.execAsync('CREATE TABLE example (id INTEGER)') }]);
    expect(execAsync.mock.calls.map(([sql]) => sql)).toEqual([
      'BEGIN EXCLUSIVE', 'CREATE TABLE example (id INTEGER)', 'PRAGMA user_version = 1',
      'COMMIT', 'BEGIN EXCLUSIVE', 'COMMIT',
    ]);
  });

  test('propagates migration failure, rolls back, and does not advance version or continue', async () => {
    const { db, execAsync } = connection();
    const error = new Error('synthetic migration failure');
    const next = jest.fn(async () => {});
    const available: Migration[] = [
      { version: 1, up: async () => { throw error; } }, { version: 2, up: next },
    ];
    await expect(runMigrations(db, available)).rejects.toBe(error);
    expect(execAsync.mock.calls.map(([sql]) => sql)).toEqual(['BEGIN EXCLUSIVE', 'ROLLBACK']);
    expect(next).not.toHaveBeenCalled();
  });

  test('rolls back when version update fails', async () => {
    const { db, execAsync } = connection();
    execAsync.mockImplementation(async (sql) => {
      if (sql.startsWith('PRAGMA user_version =')) throw new Error('version write failed');
    });
    await expect(runMigrations(db, [{ version: 1, up: async () => {} }])).rejects.toThrow('version write failed');
    expect(execAsync).toHaveBeenLastCalledWith('ROLLBACK');
  });

  test('propagates lock failure without issuing rollback on an unowned transaction', async () => {
    const { db, execAsync } = connection();
    execAsync.mockRejectedValueOnce(new Error('locked'));
    await expect(runMigrations(db)).rejects.toThrow('locked');
    expect(execAsync).toHaveBeenCalledTimes(1);
  });

  test('preserves migration error when rollback also fails', async () => {
    const { db, execAsync } = connection();
    execAsync.mockImplementation(async (sql) => { if (sql === 'ROLLBACK') throw new Error('rollback'); });
    await expect(runMigrations(db, [{ version: 1, up: async () => { throw new Error('migration'); } }]))
      .rejects.toBeInstanceOf(AggregateError);
  });

  test('rejects missing schema metadata', async () => {
    const { db, getFirstAsync } = connection();
    getFirstAsync.mockResolvedValue(null);
    await expect(runMigrations(db)).rejects.toThrow('Unable to read');
  });
});

describe('initialization (unit doubles)', () => {
  test('configures connection before migrations', async () => {
    const { db, execAsync, getFirstAsync } = connection(1);
    await initializeDatabase(db);
    expect(execAsync.mock.calls[0]).toEqual(['PRAGMA foreign_keys = ON']);
    expect(getFirstAsync.mock.calls.map(([sql]) => sql)).toEqual([
      'PRAGMA foreign_keys', 'PRAGMA journal_mode = WAL', 'PRAGMA user_version',
    ]);
  });

  test.each([0, null])('fails when foreign keys cannot be enabled: %s', async (enabled) => {
    const { db, getFirstAsync, execAsync } = connection();
    getFirstAsync.mockResolvedValueOnce(enabled === null ? null : { foreign_keys: enabled });
    await expect(initializeDatabase(db)).rejects.toThrow('Foreign-key');
    expect(execAsync).not.toHaveBeenCalledWith('BEGIN EXCLUSIVE');
  });

  test('accepts memory journal when WAL is unavailable for an in-memory database', async () => {
    const { db, getFirstAsync } = connection(1);
    getFirstAsync.mockResolvedValueOnce({ foreign_keys: 1 }).mockResolvedValueOnce({ journal_mode: 'memory' });
    await expect(initializeDatabase(db)).resolves.toBeUndefined();
  });

  test('rejects unsafe journal mode instead of continuing', async () => {
    const { db, getFirstAsync } = connection(1);
    getFirstAsync.mockResolvedValueOnce({ foreign_keys: 1 }).mockResolvedValueOnce({ journal_mode: 'off' });
    await expect(initializeDatabase(db)).rejects.toThrow('journal mode');
  });
});

describe('probe domain boundaries', () => {
  test.each([176425, -176425, 0, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER])('decodes validated centavos %s', (amount) => {
    const decoded = decodeProbeRow({ minor_units: amount, currency: 'PHP', financial_date: '2026-09-30' });
    expect(decoded.money.equals(Money.fromMinorUnits(amount, 'PHP'))).toBe(true);
    expect(decoded.date.equals(FinancialDate.parse('2026-09-30'))).toBe(true);
  });

  test.each([
    { minor_units: 1, currency: 'USD', financial_date: '2026-09-30' },
    { minor_units: 1, currency: 'PHP', financial_date: '2026-02-29' },
    { minor_units: 1, currency: 'PHP', financial_date: '2026-9-30' },
    ...[0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, Number.MIN_SAFE_INTEGER - 1, '1', null].map(
      (minor_units) => ({ minor_units, currency: 'PHP', financial_date: '2026-09-30' }),
    ),
  ])('rejects malformed persisted row %#', (row) => {
    expect(() => decodeProbeRow(row)).toThrow();
  });

  test('binds values rather than interpolating them into SQL', async () => {
    const { db, runAsync } = connection();
    await writeProbe(db, "probe';--", Money.fromMinorUnits(176425, 'PHP'), FinancialDate.parse('2026-09-30'));
    expect(runAsync).toHaveBeenCalledWith(expect.stringContaining('VALUES (?, ?, ?, ?)'),
      "probe';--", 176425, 'PHP', '2026-09-30');
  });

  test('returns null for absent row', async () => {
    await expect(readProbe(connection().db, 'absent')).resolves.toBeNull();
  });
});
