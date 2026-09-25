import { openDatabaseAsync } from 'expo-sqlite';

import { LAYA_DATABASE_NAME, openLayaDatabase } from './database';
import { initializeDatabase } from './initialize';

jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));
jest.mock('./initialize', () => ({ initializeDatabase: jest.fn() }));

// Lifecycle control flow only; no native SQLite executes in this file.
const open = jest.mocked(openDatabaseAsync);
const initialize = jest.mocked(initializeDatabase);

beforeEach(() => jest.resetAllMocks());

test('returns connection only after initialization completes', async () => {
  const db = { closeAsync: jest.fn() } as unknown as Awaited<ReturnType<typeof openDatabaseAsync>>;
  open.mockResolvedValue(db);
  let finish!: () => void;
  initialize.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
  let ready = false;
  const pending = openLayaDatabase().then((value) => { ready = true; return value; });
  await Promise.resolve();
  expect(open).toHaveBeenCalledWith(LAYA_DATABASE_NAME, { useNewConnection: true });
  expect(ready).toBe(false);
  finish();
  await expect(pending).resolves.toBe(db);
});

test('propagates open failure without initializing', async () => {
  const error = new Error('open failed');
  open.mockRejectedValue(error);
  await expect(openLayaDatabase()).rejects.toBe(error);
  expect(initialize).not.toHaveBeenCalled();
});

test('closes failed initialization without resetting or reopening', async () => {
  const close = jest.fn(async () => {});
  open.mockResolvedValue({ closeAsync: close } as unknown as Awaited<ReturnType<typeof openDatabaseAsync>>);
  const error = new Error('migration failed');
  initialize.mockRejectedValue(error);
  await expect(openLayaDatabase()).rejects.toBe(error);
  expect(close).toHaveBeenCalledTimes(1);
  expect(open).toHaveBeenCalledTimes(1);
});

test('retains both initialization and cleanup failures', async () => {
  open.mockResolvedValue({ closeAsync: async () => { throw new Error('close'); } } as unknown as Awaited<ReturnType<typeof openDatabaseAsync>>);
  initialize.mockRejectedValue(new Error('initialize'));
  await expect(openLayaDatabase()).rejects.toBeInstanceOf(AggregateError);
});
