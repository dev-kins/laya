import { AvailableMoney } from '../domain/AvailableMoney';
import type { FinancialConnection } from '../persistence/sqlite/connection';
import { AvailableMoneyFormError, parseAvailableMoney, readAvailableMoney, saveAvailableMoney } from './availableMoney';

test.each(['0', '8200', '8200.5', '8200.50', ' 8200.50 ', '90071992547409.91'])('exact parsing accepts %s', text => {
  expect(parseAvailableMoney(text)).toBeInstanceOf(AvailableMoney);
});
test.each(['', ' ', '-1', '8200.999', '₱8200', '8,200', '1e3', '90071992547409.92'])('invalid input %s rejects', text => {
  expect(() => parseAvailableMoney(text)).toThrow(AvailableMoneyFormError);
});
function setup() {
  const close = jest.fn(async () => {});
  const db: FinancialConnection = { closeAsync: close, execAsync: jest.fn(), getFirstAsync: jest.fn(), getAllAsync: jest.fn(), runAsync: jest.fn() };
  const open = jest.fn(async () => db);
  let current: AvailableMoney | null = null;
  const get = jest.fn(async () => current);
  const save = jest.fn(async (snapshot: AvailableMoney) => { current = snapshot; });
  const repository = jest.fn(() => ({ get, save }));
  const deps = { open, repository };
  return { close, db, open, get, save, repository, read: () => readAvailableMoney(deps), write: (text = '8200.50') => saveAvailableMoney(text, deps) };
}
test('missing, create, read, replace and zero stay distinct and close each operation', async () => {
  const s = setup();
  await expect(s.read()).resolves.toBeNull();
  const first = await s.write();
  expect(first.amount.minorUnits).toBe(820050);
  expect(s.save).toHaveBeenCalledWith(first);
  await expect(s.read()).resolves.toBe(first);
  const replacement = await s.write('6750.25');
  expect(replacement.amount.minorUnits).toBe(675025);
  await expect(s.read()).resolves.toBe(replacement);
  const zero = await s.write('0');
  expect(zero.amount.minorUnits).toBe(0);
  await expect(s.read()).resolves.toBe(zero);
  expect(s.close).toHaveBeenCalledTimes(7);
  expect(s.repository).toHaveBeenCalledWith(s.db);
});
test('invalid amount fails before opening storage', async () => {
  const s = setup();
  await expect(s.write('-1')).rejects.toBeInstanceOf(AvailableMoneyFormError);
  expect(s.open).not.toHaveBeenCalled();
});
describe.each(['read', 'write'] as const)('%s ownership', method => {
  test('open failure never closes an unowned connection', async () => {
    const s = setup(); const failure = new Error('synthetic open'); s.open.mockRejectedValue(failure);
    await expect(s[method]()).rejects.toBe(failure);
    expect(s.close).not.toHaveBeenCalled();
    expect(s.repository).not.toHaveBeenCalled();
  });
  test.each([false, true])('operation failure closes; combined cleanup failure: %s', async failClose => {
    const s = setup(); const failure = new Error('synthetic operation'); const cleanup = new Error('synthetic close');
    if (method === 'read') s.get.mockRejectedValue(failure); else s.save.mockRejectedValue(failure);
    if (failClose) s.close.mockRejectedValue(cleanup);
    if (failClose) await expect(s[method]()).rejects.toMatchObject({ errors: [failure, cleanup] });
    else await expect(s[method]()).rejects.toBe(failure);
    expect(s.close).toHaveBeenCalledTimes(1);
  });
  test('cleanup failure does not become success', async () => {
    const s = setup(); const failure = new Error('synthetic cleanup'); s.close.mockRejectedValue(failure);
    await expect(s[method]()).rejects.toBe(failure);
    expect(s.close).toHaveBeenCalledTimes(1);
  });
  test('success waits for cleanup', async () => {
    const s = setup(); let finish!: () => void;
    s.close.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const completed = jest.fn(); const pending = s[method]().then(completed);
    for (let i = 0; i < 8; i++) await Promise.resolve();
    expect(s.close).toHaveBeenCalledTimes(1);
    expect(completed).not.toHaveBeenCalled();
    finish(); await pending;
    expect(completed).toHaveBeenCalledTimes(1);
  });
});
