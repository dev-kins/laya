import { uuid } from 'expo-modules-core';

import { Income } from '../domain/Income';
import type { FinancialConnection } from '../persistence/sqlite/connection';
import { openLayaDatabase } from '../persistence/sqlite/database';
import { createAddIncomeOperation } from './addIncome';
import { emptyIncomeForm, type IncomeForm } from './incomeForm';

jest.mock('../persistence/sqlite/database', () => ({ openLayaDatabase: jest.fn() }));
const form: IncomeForm = { ...emptyIncomeForm, name: 'Synthetic', amount: '10.01', status: 'expected', date: '2026-10-04' };
function setup() {
  const close = jest.fn(async () => {});
  const db: FinancialConnection = { closeAsync: close, execAsync: jest.fn(), getFirstAsync: jest.fn(), getAllAsync: jest.fn(), runAsync: jest.fn() };
  const open = jest.fn(async () => db);
  const save = jest.fn(async (_income: Income) => {});
  const generateId = jest.fn(() => 'synthetic-id');
  const operation = createAddIncomeOperation({ open, generateId, repository: () => ({ save }) });
  return { operation, open, save, close, generateId, db };
}
afterEach(() => jest.restoreAllMocks());

test('application constructs validated Income, saves and closes before success', async () => {
  const { operation, save, close, generateId } = setup();
  const result = await operation(form);
  expect(result).toBeInstanceOf(Income);
  expect(result.amount.minorUnits).toBe(1001);
  expect(result.id).toBe('synthetic-id');
  expect(save).toHaveBeenCalledWith(result);
  expect(generateId).toHaveBeenCalledTimes(1);
  expect(close).toHaveBeenCalledTimes(1);
});
test('invalid form does not generate an ID or open storage', async () => {
  const { operation, open, generateId } = setup();
  await expect(operation({ ...form, amount: '-1' })).rejects.toThrow();
  expect(open).not.toHaveBeenCalled();
  expect(generateId).not.toHaveBeenCalled();
});
test('invalid supplied ID fails before opening', async () => {
  const { db, open } = setup();
  const operation = createAddIncomeOperation({ open, generateId: () => ' padded ', repository: () => ({ save: async () => {} }) });
  await expect(operation(form)).rejects.toThrow('Identifier');
  expect(open).not.toHaveBeenCalled();
  expect(db.closeAsync).not.toHaveBeenCalled();
});
test('failed opening does not close an unowned connection', async () => {
  const { operation, open, close } = setup();
  open.mockRejectedValue(new Error('open'));
  await expect(operation(form)).rejects.toThrow('open');
  expect(close).not.toHaveBeenCalled();
});
test('failed save closes once and preserves failure', async () => {
  const { operation, save, close } = setup();
  const error = new Error('synthetic write');
  save.mockRejectedValue(error);
  await expect(operation(form)).rejects.toBe(error);
  expect(close).toHaveBeenCalledTimes(1);
});
test('save and close failures are retained together', async () => {
  const { operation, save, close } = setup();
  const error = new Error('synthetic write');
  const cleanup = new Error('synthetic close');
  save.mockRejectedValue(error); close.mockRejectedValue(cleanup);
  await expect(operation(form)).rejects.toMatchObject({ errors: [error, cleanup] });
  expect(close).toHaveBeenCalledTimes(1);
});
test('close failure is a failure; retry retains ID and updates the same snapshot', async () => {
  const { operation, save, close, generateId } = setup();
  close.mockRejectedValueOnce(new Error('close'));
  await expect(operation(form)).rejects.toThrow('close');
  await expect(operation({ ...form, amount: '12.34' })).resolves.toMatchObject({ id: 'synthetic-id' });
  expect(save.mock.calls.map(([entity]) => entity.id)).toEqual(['synthetic-id', 'synthetic-id']);
  expect(generateId).toHaveBeenCalledTimes(1);
  expect(close).toHaveBeenCalledTimes(2);
});
test('default operation uses existing Expo UUID v4 facility', async () => {
  const { db } = setup();
  jest.mocked(openLayaDatabase).mockResolvedValue(db as Awaited<ReturnType<typeof openLayaDatabase>>);
  const generate = jest.spyOn(uuid, 'v4').mockReturnValue('ca52efc1-66f1-4082-853a-1691a9ebf0e2');
  expect((await createAddIncomeOperation()(form)).id).toBe('ca52efc1-66f1-4082-853a-1691a9ebf0e2');
  expect(generate).toHaveBeenCalledTimes(1);
});

test('received entity passed to repository never has stale recurrence', async () => {
  const { operation, save } = setup();
  const result = await operation({ ...form, status: 'received', recurrence: 'monthly', firstDay: '31' });
  expect(result.status).toBe('received');
  expect(result.recurrence).toBeUndefined();
  expect(save).toHaveBeenCalledWith(result);
});

test('save failure retry retains generated ID and waits for close before success', async () => {
  const { operation, save, close, generateId } = setup();
  save.mockRejectedValueOnce(new Error('synthetic write'));
  await expect(operation(form)).rejects.toThrow('synthetic write');
  let finish!: () => void;
  close.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const completed = jest.fn();
  const pending = operation(form).then(completed);
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  expect(close).toHaveBeenCalledTimes(2);
  expect(completed).not.toHaveBeenCalled();
  finish(); await pending;
  expect(generateId).toHaveBeenCalledTimes(1);
  expect(save.mock.calls.map(([entity]) => entity.id)).toEqual(['synthetic-id', 'synthetic-id']);
  expect(completed).toHaveBeenCalledTimes(1);
});
