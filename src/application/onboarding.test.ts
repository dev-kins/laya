import { openLayaDatabase } from '../persistence/sqlite/database';
import { onboardingService } from './onboarding';

jest.mock('../persistence/sqlite/database', () => ({ openLayaDatabase: jest.fn() }));
const open = jest.mocked(openLayaDatabase);
const close = jest.fn(async () => {});
const read = jest.fn();
const write = jest.fn();
beforeEach(() => {
  jest.resetAllMocks();
  open.mockResolvedValue({ closeAsync: close, getFirstAsync: read, runAsync: write } as unknown as Awaited<ReturnType<typeof openLayaDatabase>>);
});

test('read resolves only after database initialization and closes the owned connection', async () => {
  read.mockResolvedValue({ value: '1' });
  await expect(onboardingService.isComplete()).resolves.toBe(true);
  expect(open).toHaveBeenCalledTimes(1);
  expect(close).toHaveBeenCalledTimes(1);
});
test('completion waits for write and releases the connection', async () => {
  await expect(onboardingService.complete()).resolves.toBeUndefined();
  expect(write).toHaveBeenCalledTimes(1);
  expect(close).toHaveBeenCalledTimes(1);
});
test('failed open propagates without closing an unowned connection', async () => {
  open.mockRejectedValue(new Error('open'));
  await expect(onboardingService.isComplete()).rejects.toThrow('open');
  expect(close).not.toHaveBeenCalled();
});
test('read failure releases the connection', async () => {
  read.mockRejectedValue(new Error('read'));
  await expect(onboardingService.isComplete()).rejects.toThrow('read');
  expect(close).toHaveBeenCalledTimes(1);
});
test('write and cleanup failures are both preserved', async () => {
  const writeError = new Error('write');
  const closeError = new Error('close');
  write.mockRejectedValue(writeError);
  close.mockRejectedValue(closeError);
  await expect(onboardingService.complete()).rejects.toMatchObject({ errors: [writeError, closeError] });
  expect(close).toHaveBeenCalledTimes(1);
});
test('close failure is not hidden after a successful operation', async () => {
  close.mockRejectedValue(new Error('close'));
  await expect(onboardingService.complete()).rejects.toThrow('close');
});
