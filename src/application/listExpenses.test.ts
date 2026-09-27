import { FinancialDate } from '../domain/FinancialDate';
import { EssentialObligation } from '../domain/EssentialObligation';
import { obligationId } from '../domain/identifiers';
import { Money } from '../domain/Money';
import type { FinancialConnection } from '../persistence/sqlite/connection';
import { listExpenses } from './listExpenses';

const expense = EssentialObligation.create({ id: obligationId('synthetic'), name: 'Synthetic expense', amount: Money.fromMinorUnits(1058478, 'PHP'), date: FinancialDate.parse('2026-10-04') });
function setup() {
  const close = jest.fn(async () => {});
  const db: FinancialConnection = { closeAsync: close, execAsync: jest.fn(), getFirstAsync: jest.fn(), getAllAsync: jest.fn(), runAsync: jest.fn() };
  const open = jest.fn(async () => db);
  const list = jest.fn<Promise<readonly EssentialObligation[]>, []>().mockResolvedValue(Object.freeze([expense]));
  const repository = jest.fn(() => ({ list }));
  return { close, open, list, repository, db, run: () => listExpenses({ open, repository }) };
}
test('returns repository entities without mutation or sorting, after closing', async () => {
  const { run, close, repository, db, list } = setup();
  const values = Object.freeze([expense, EssentialObligation.create({ ...expense, id: obligationId('a') })]);
  list.mockResolvedValue(values);
  const result = await run();
  expect(result).toBe(values);
  expect(result[0]).toBe(expense);
  expect(expense.amount.minorUnits).toBe(1058478);
  expect(Object.isFrozen(expense)).toBe(true);
  expect(repository).toHaveBeenCalledWith(db);
  expect(list).toHaveBeenCalledTimes(1);
  expect(close).toHaveBeenCalledTimes(1);
});
test('empty is a successful read and still closes', async () => {
  const { run, list, close } = setup();
  list.mockResolvedValue([]);
  await expect(run()).resolves.toEqual([]);
  expect(close).toHaveBeenCalledTimes(1);
});
test('read failure propagates and closes once', async () => {
  const { run, list, close } = setup();
  const failure = new Error('synthetic read failure');
  list.mockRejectedValue(failure);
  await expect(run()).rejects.toBe(failure);
  expect(close).toHaveBeenCalledTimes(1);
});
test('failed open never closes an unowned connection', async () => {
  const { run, open, close, repository } = setup();
  const failure = new Error('synthetic open failure');
  open.mockRejectedValue(failure);
  await expect(run()).rejects.toBe(failure);
  expect(close).not.toHaveBeenCalled();
  expect(repository).not.toHaveBeenCalled();
});
test('read and cleanup failure preserve both causes', async () => {
  const { run, list, close } = setup();
  const failure = new Error('synthetic read');
  const cleanup = new Error('synthetic cleanup');
  list.mockRejectedValue(failure); close.mockRejectedValue(cleanup);
  await expect(run()).rejects.toMatchObject({ errors: [failure, cleanup] });
  expect(close).toHaveBeenCalledTimes(1);
});
test('cleanup-only failure rejects rather than returning apparently successful data', async () => {
  const { run, close } = setup();
  const failure = new Error('synthetic cleanup');
  close.mockRejectedValue(failure);
  await expect(run()).rejects.toBe(failure);
  expect(close).toHaveBeenCalledTimes(1);
});
test('success waits for cleanup to finish', async () => {
  const { run, close } = setup();
  let finish!: () => void;
  close.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const completed = jest.fn();
  const pending = run().then(completed);
  // Allow open and list promises to finish and cleanup to begin.
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  expect(close).toHaveBeenCalledTimes(1);
  expect(completed).not.toHaveBeenCalled();
  finish(); await pending;
  expect(completed).toHaveBeenCalledWith([expense]);
});
