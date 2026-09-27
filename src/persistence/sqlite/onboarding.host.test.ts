/// <reference types="node" />
// Real file-backed host SQLite; this does not substitute for Android validation.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import type { SQLiteConnection, SqlValue } from './connection';
import { initializeDatabase } from './initialize';
import { migrations, runMigrations } from './migrations';
import { createOnboardingRepository, ONBOARDING_COMPLETED_KEY } from './onboarding';

let directory: string;
let db: SQLiteConnection;
function open(): SQLiteConnection {
  const native = new DatabaseSync(join(directory, 'onboarding.db'));
  return {
    async execAsync(sql) { native.exec(sql); },
    async getFirstAsync<T>(sql: string, ...params: SqlValue[]) { return (native.prepare(sql).get(...params) as T | undefined) ?? null; },
    async runAsync(sql, ...params) { return native.prepare(sql).run(...params); },
    async closeAsync() { native.close(); },
  };
}
beforeEach(() => { directory = mkdtempSync(join(tmpdir(), 'laya-onboarding-')); db = open(); });
afterEach(async () => { await db.closeAsync(); rmSync(directory, { recursive: true, force: true }); });

test('fresh initialization has version 4 and missing completion is false', async () => {
  await initializeDatabase(db);
  expect(await db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 4 });
  await expect(createOnboardingRepository(db).isComplete()).resolves.toBe(false);
});

test.each(['0', 'true', '01', '1 ', '', 'corrupt'])('malformed value %j remains incomplete', async (value) => {
  await initializeDatabase(db);
  await db.runAsync('INSERT INTO app_preferences VALUES (?, ?)', ONBOARDING_COMPLETED_KEY, value);
  await expect(createOnboardingRepository(db).isComplete()).resolves.toBe(false);
});

test('completion is idempotent, replaces malformed state, and survives reopening', async () => {
  await initializeDatabase(db);
  await db.runAsync('INSERT INTO app_preferences VALUES (?, ?)', ONBOARDING_COMPLETED_KEY, 'bad');
  const repository = createOnboardingRepository(db);
  await repository.markComplete();
  await repository.markComplete();
  expect(await db.getFirstAsync('SELECT value FROM app_preferences WHERE key = ?', ONBOARDING_COMPLETED_KEY)).toEqual({ value: '1' });
  await db.closeAsync();
  db = open();
  await initializeDatabase(db);
  await expect(createOnboardingRepository(db).isComplete()).resolves.toBe(true);
});

test('migration from version 1 preserves existing synthetic data, including after reopen', async () => {
  await initializeDatabase(db, migrations.slice(0, 1));
  await db.runAsync('INSERT INTO infrastructure_probe VALUES (?, ?, ?, ?)', 'existing', 12345, 'PHP', '2026-09-30');
  await initializeDatabase(db);
  await db.closeAsync();
  db = open();
  await initializeDatabase(db);
  expect(await db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 4 });
  expect(await db.getFirstAsync('SELECT * FROM infrastructure_probe')).toEqual({ id: 'existing', minor_units: 12345, currency: 'PHP', financial_date: '2026-09-30' });
  await expect(createOnboardingRepository(db).isComplete()).resolves.toBe(false);
});

test('version 2 rolls back table creation if version write fails, then retries', async () => {
  await initializeDatabase(db, migrations.slice(0, 1));
  const failing: SQLiteConnection = { ...db, async execAsync(sql) {
    if (sql === 'PRAGMA user_version = 2') throw new Error('synthetic write failure');
    await db.execAsync(sql);
  } };
  await expect(runMigrations(failing)).rejects.toThrow('synthetic write failure');
  expect(await db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 1 });
  expect(await db.getFirstAsync("SELECT name FROM sqlite_master WHERE name = 'app_preferences'")).toBeNull();
  await db.closeAsync();
  db = open();
  await initializeDatabase(db);
  await expect(createOnboardingRepository(db).isComplete()).resolves.toBe(false);
});

test('read and write errors propagate rather than indicating completion', async () => {
  await expect(createOnboardingRepository(db).isComplete()).rejects.toThrow();
  await expect(createOnboardingRepository(db).markComplete()).rejects.toThrow();
});
